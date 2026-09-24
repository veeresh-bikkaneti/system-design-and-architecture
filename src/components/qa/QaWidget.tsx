import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { prepareTurn, isAboutTutor, isFollowUp, OFF_COURSE } from '../../ai/local/agent';
import { OKF_CARDS } from '../../ai/local/cards';
import { GENERAL_KNOWLEDGE_CONFIDENCE, grounding, type ConfidenceLevel } from '../../ai/local/web';
import {
  answerParametrically,
  getModelStatus,
  MODEL_LABEL,
  rewriteWithModel,
  subscribeModel,
  type ModelStatus,
} from '../../ai/local/inference';
import { loadSemantic, semanticWithin, subscribeSemantic, type Semantic, type SemanticPhase } from '../../ai/local/semantic/embedder';
import { dot } from '../../ai/local/semantic/codec';
import { queryText, route, THRESHOLDS } from '../../ai/local/semantic/router';
import { buildTurn, NO_SOURCE } from '../../ai/local/semantic/turn';
import type { ChatTurn } from '../../ai/local/types';
import { ChatMarkdown } from '../ChatMarkdown';
import { useQaHistory } from './useQaHistory';

/**
 * There is no backend for the Q&A tutor: it runs entirely in the browser
 * (see ../../ai/local/inference.ts), on any device, with no API key and no
 * server. The transcript is the browser's own memory -- useQaHistory
 * persists it to localStorage so it survives a reload.
 */

const LESSON_IDS = new Set(OKF_CARDS.filter((card) => card.type === 'Lesson').map((card) => card.id));

/** Keeps one runaway paste from blowing up the on-device model's context window. */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * How long a question waits for the understanding layer (23 MB, cached after the
 * first visit) before Ben answers with the keyword pipeline instead.
 */
const SEMANTIC_WAIT_MS = 12_000;

function lessonHref(id: string): string {
  return `${import.meta.env.BASE_URL}lesson/${id}`;
}

function priorTurns(history: ChatTurn[]): string {
  return history
    .slice(-4)
    .map((item) => `${item.role === 'user' ? 'Learner' : 'Tutor'}: ${item.content.slice(0, 280)}`)
    .join('\n');
}

interface BubbleSource {
  title: string;
  href: string;
}

interface QaMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  sources?: BubbleSource[];
  confidence?: { level: ConfidenceLevel; label: string };
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5.2 3.9A.75.75 0 0 1 2.6 21.2l1.1-4.5A2 2 0 0 1 4 15.5h0V6a2 2 0 0 1 2-2Z" />
      <circle cx="9" cy="11" r="1.2" fill="rgb(255 255 255)" />
      <circle cx="12.5" cy="11" r="1.2" fill="rgb(255 255 255)" />
      <circle cx="16" cy="11" r="1.2" fill="rgb(255 255 255)" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3.4 20.4c-.4.1-.7-.3-.6-.7L5 13.2 16 12 5 10.8l-2.2-6.5c-.1-.4.2-.8.6-.7l17 5.8c.5.2.5.9 0 1.1l-17 5.9Z" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2c.6 4.8 2.9 7.4 5.2 8.4L22 12l-4.8 1.6c-2.3 1-4.6 3.6-5.2 8.4-.6-4.8-2.9-7.4-5.2-8.4L2 12l4.8-1.6C9.1 9.4 11.4 6.8 12 2Z" />
    </svg>
  );
}

function NewTopicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M17 10a7 7 0 1 1-2.05-4.95" />
      <path d="M17 3v4h-4" />
    </svg>
  );
}

export function QaWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useQaHistory<QaMessage>();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>(getModelStatus());
  const [semanticPhase, setSemanticPhase] = useState<SemanticPhase>('idle');
  // A restored transcript may already contain ids; never hand out one that collides.
  const nextId = useRef(messages.reduce((max, m) => Math.max(max, m.id + 1), 0));
  const scrollRef = useRef<HTMLDivElement>(null);

  const { pathname } = useLocation();
  const focusId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const index = parts.lastIndexOf('lesson');
    const slug = index >= 0 ? parts[index + 1] : undefined;
    return slug && OKF_CARDS.some((card) => card.id === slug) ? slug : undefined;
  }, [pathname]);
  const focusTitle = OKF_CARDS.find((card) => card.id === focusId)?.title;

  useEffect(() => subscribeModel(setModelStatus), []);
  useEffect(() => subscribeSemantic(setSemanticPhase), []);

  // Start the understanding layer as soon as the chat opens, not on the first question.
  useEffect(() => {
    if (open) void loadSemantic();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  function addMessage(role: QaMessage['role'], content: string, isError = false): number {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, role, content, isError }]);
    return id;
  }

  function patchMessage(id: number, patch: Partial<QaMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleSend() {
    const text = input.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || streaming) return;
    setInput('');
    const history: ChatTurn[] = messages
      .filter((message) => !message.isError && message.content.length > 0)
      .map((message) => ({ role: message.role, content: message.content }));
    addMessage('user', text);
    const assistantId = addMessage('assistant', '');

    setStreaming(true);
    try {
      const semantic = await semanticWithin(SEMANTIC_WAIT_MS);
      if (semantic) await answerByMeaning(semantic, text, history, assistantId);
      else await answerByKeywords(text, history, assistantId);
    } catch {
      patchMessage(assistantId, {
        content: 'I could not reach a source just now, so I will not guess.',
        confidence: { level: 'low', label: 'Low confidence · the source check failed' },
      });
    } finally {
      setStreaming(false);
    }
  }

  /**
   * No lesson and no web lookup: the question still deserves an answer, so
   * Ben asks the model directly from its own trained knowledge, clearly
   * labelled as such (GENERAL_KNOWLEDGE_CONFIDENCE). There is no grounded
   * text to check the draft against, so unlike the lesson-rewrite path this
   * either shows the model's answer or the honest "could not find a
   * source" line -- never a half-grounded guess.
   */
  async function answerFromModelKnowledge(text: string, history: ChatTurn[], assistantId: number) {
    const draft = await answerParametrically(text, priorTurns(history));
    if (draft) {
      patchMessage(assistantId, { content: draft, sources: [], confidence: GENERAL_KNOWLEDGE_CONFIDENCE });
    } else {
      patchMessage(assistantId, {
        content: NO_SOURCE,
        sources: [],
        confidence: { level: 'low', label: 'Low confidence · I could not find a source, so I will not guess' },
      });
    }
  }

  /** The understanding layer decides; tools run only when the decision needs them. */
  async function answerByMeaning(semantic: Semantic, text: string, history: ChatTurn[], assistantId: number) {
    const vector = await semantic.embed(queryText(text, history));
    const decision = route({ question: text, focusId, vector, index: semantic.index });
    const turn = buildTurn(text, history, decision);
    const sources: BubbleSource[] = turn.sources
      .filter((source) => LESSON_IDS.has(source.id))
      .map((source) => ({ title: source.title, href: lessonHref(source.id) }));

    if (turn.action === 'parametric_fallback') {
      await answerFromModelKnowledge(text, history, assistantId);
      return;
    }

    const { answer, confidence, context } = turn;
    patchMessage(assistantId, { content: answer, sources, confidence });
    if (!context) return;

    // Qwen only rewords. A draft that wanders from the grounded answer is dropped.
    const draft = await rewriteWithModel(text, context, priorTurns(history));
    if (!draft) return;
    const [draftVector, answerVector] = await Promise.all([semantic.embed(draft), semantic.embed(answer)]);
    if (dot(draftVector, answerVector) >= THRESHOLDS.draftFit) patchMessage(assistantId, { content: draft });
  }

  /** Fallback when the understanding layer cannot load: keyword routing with guard rails. */
  async function answerByKeywords(text: string, history: ChatTurn[], assistantId: number) {
    const turn = prepareTurn(text, history, focusId);
    const sources: BubbleSource[] = turn.inScope
      ? turn.sources
          .filter((source) => LESSON_IDS.has(source.id))
          .map((source) => ({ title: source.title, href: lessonHref(source.id) }))
      : [];
    const aboutMe = isAboutTutor(text) || isFollowUp(text);

    if (!aboutMe && turn.parametric) {
      await answerFromModelKnowledge(text, history, assistantId);
      return;
    }

    const offCourse = !aboutMe && !turn.inScope;
    const confidence = grounding({ aboutMe, inScope: turn.inScope, offCourse });
    const content = aboutMe ? turn.answer : turn.inScope ? turn.answer : OFF_COURSE;
    patchMessage(assistantId, {
      content,
      sources,
      confidence: { ...confidence, label: `${confidence.label} · keyword match` },
    });

    if (aboutMe || !turn.inScope) return;
    const draft = await rewriteWithModel(text, turn.context, priorTurns(history));
    if (draft) patchMessage(assistantId, { content: draft });
  }

  function handleNewTopic() {
    if (streaming) return;
    setMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close course Q&A' : 'Open course Q&A'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-[0_8px_24px_rgb(180_83_9/0.45)] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-amber-700 hover:shadow-[0_12px_28px_rgb(180_83_9/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:translate-y-0"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatBubbleIcon className="h-7 w-7" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Course Q&A"
          className="fixed bottom-20 right-5 z-50 flex h-[520px] max-h-[75vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_20px_60px_rgb(120_53_15/0.25)] dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="flex items-center gap-3 border-b border-stone-200/80 bg-amber-50/60 px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
              <SparkIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Ask Ben
              </h2>
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                {semanticPhase === 'loading'
                  ? 'Getting ready · reading the lessons'
                  : modelStatus.phase === 'loading'
                    ? `Loading ${MODEL_LABEL} · ${modelStatus.progress}%`
                    : modelStatus.phase === 'ready'
                      ? modelStatus.detail
                      : 'Runs in your browser · no API key'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewTopic}
                disabled={streaming}
                aria-label="New topic (forget this conversation)"
                title="New topic"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <NewTopicIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <CloseIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
          {focusTitle && (
            <p className="border-b border-stone-200/80 bg-amber-50/40 px-4 py-1.5 text-[11px] text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
              This page: {focusTitle}
            </p>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                  Hi, I'm Ben. Ask me like you'd ask a person. I'll check the lesson first, and if it's not there, I'll look it up and show you the source. I remember this conversation until you start a new topic.
                </p>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-amber-700 text-white shadow-[0_2px_8px_rgb(180_83_9/0.25)]'
                      : message.isError
                        ? 'rounded-bl-md border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'rounded-bl-md border border-stone-200/70 bg-stone-100 text-stone-800 shadow-[0_1px_3px_rgb(0_0_0/0.04)] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100'
                  }`}
                >
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  ) : message.content ? (
                    <ChatMarkdown content={message.content} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-stone-400 dark:text-stone-400">
                      <span className="flex gap-1" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
                          style={{ animationDelay: '0.2s' }}
                        />
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
                          style={{ animationDelay: '0.4s' }}
                        />
                      </span>
                      Thinking
                    </span>
                  )}
                  {message.confidence && (
                    message.confidence.level === 'general' ? (
                      <p className="mt-2 inline-flex w-fit items-center rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        {message.confidence.label}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                        {message.confidence.label}
                      </p>
                    )
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-200/70 pt-2 dark:border-stone-700">
                      {message.sources.map((source) => (
                        <a
                          key={source.href}
                          href={source.href}
                          {...(source.href.startsWith('http')
                            ? { target: '_blank', rel: 'noreferrer' }
                            : {})}
                          className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <p className="px-1 text-xs text-stone-400 dark:text-stone-400" aria-live="polite">
                The assistant is writing…
              </p>
            )}
          </div>

          <div className="border-t border-stone-200/80 p-3.5 dark:border-stone-800">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the course…"
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={streaming}
                aria-label="Ask about the course"
                className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-amber-600"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={streaming || !input.trim()}
                aria-label="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-700 text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none dark:disabled:bg-stone-700 dark:disabled:text-stone-400"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
