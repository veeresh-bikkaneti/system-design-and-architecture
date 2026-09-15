import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_MODEL, PROVIDER_PRESETS, useAISettingsStore } from '../store/aiSettings';
import { getLessonBySlug } from '../lib/lessons';
import { buildSystemPrompt } from '../ai/systemPrompt';
import { streamTutorReply, type TutorMessage } from '../ai/client';
import { ChatMarkdown } from './ChatMarkdown';
import { SettingsModal } from './SettingsModal';

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

const DEMO_USER_MESSAGE = 'Show me the control flow of a load balancer';

const DEMO_ASSISTANT_MESSAGE = `Sure — here's a simple request flow through a load-balanced web tier. The client always talks to the load balancer, never directly to a backend; the balancer picks a healthy backend instance using a strategy like round-robin or least-connections, and a shared cache sits alongside the pool so repeat reads don't hit the database every time.

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant LB as Load Balancer
    participant B1 as Backend 1
    participant B2 as Backend 2
    participant Cache
    participant DB as Database

    Client->>LB: HTTP request
    LB->>B1: Forward (round-robin)
    B1->>Cache: Check cache
    Cache-->>B1: Miss
    B1->>DB: Query
    DB-->>B1: Result
    B1-->>LB: Response
    LB-->>Client: Response
\`\`\`

Notice the client has no idea which backend served it — that's the whole point of the load balancer as an abstraction boundary.`;

function getLessonContextForPath(pathname: string) {
  const match = pathname.match(/\/lesson\/([^/]+)/);
  if (!match) return undefined;
  const lesson = getLessonBySlug(match[1]);
  if (!lesson) return undefined;
  return { lessonTitle: lesson.meta.title, lessonSummary: lesson.meta.summary };
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.5 7.5 0 0 0-.14-1.4l2-1.55a.5.5 0 0 0 .12-.64l-1.9-3.3a.5.5 0 0 0-.6-.22l-2.35.95a7.6 7.6 0 0 0-2.42-1.4L15.75 2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.36 2.54a7.6 7.6 0 0 0-2.42 1.4l-2.35-.95a.5.5 0 0 0-.6.22l-1.9 3.3a.5.5 0 0 0 .12.64l2 1.55a7.5 7.5 0 0 0 0 2.8l-2 1.55a.5.5 0 0 0-.12.64l1.9 3.3c.12.2.37.3.6.22l2.35-.95c.75.56 1.56 1.03 2.42 1.4l.36 2.54c.05.24.26.4.5.4h3.8c.24 0 .45-.16.5-.4l.36-2.54a7.6 7.6 0 0 0 2.42-1.4l2.35.95c.23.08.48 0 .6-.22l1.9-3.3a.5.5 0 0 0-.12-.64l-2-1.55c.1-.45.14-.92.14-1.4ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
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

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const apiKey = useAISettingsStore((state) => state.apiKey);
  const provider = useAISettingsStore((state) => state.provider);
  const baseUrl = useAISettingsStore((state) => state.baseUrl);
  const model = useAISettingsStore((state) => state.model);
  const location = useLocation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isStreaming]);

  // Cancel any in-flight stream if the widget unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function addEntry(role: ChatEntry['role'], content: string, isError = false): number {
    const id = nextId.current++;
    setEntries((prev) => [...prev, { id, role, content, isError }]);
    return id;
  }

  function updateEntry(id: number, content: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, content } : e)));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming || !apiKey) return;

    setInput('');
    addEntry('user', text);

    const history: TutorMessage[] = [...entries, { role: 'user', content: text } as ChatEntry].map(
      (e) => ({ role: e.role, content: e.content }),
    );

    const assistantId = addEntry('assistant', '');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const lessonContext = getLessonContextForPath(location.pathname);
    const systemPrompt = buildSystemPrompt(lessonContext);

    let accumulated = '';
    try {
      await streamTutorReply({
        apiKey,
        provider,
        baseUrl,
        model: model || DEFAULT_MODEL,
        systemPrompt,
        messages: history,
        signal: controller.signal,
        onDelta: (chunk) => {
          accumulated += chunk;
          updateEntry(assistantId, accumulated);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setEntries((prev) =>
        prev.map((e) =>
          e.id === assistantId ? { ...e, content: accumulated || message, isError: true } : e,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleDemo() {
    addEntry('user', DEMO_USER_MESSAGE);
    addEntry('assistant', DEMO_ASSISTANT_MESSAGE);
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
        aria-label={open ? 'Close AI tutor chat' : 'Open AI tutor chat'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-[0_8px_24px_rgb(180_83_9/0.45)] transition-all hover:-translate-y-0.5 hover:bg-amber-700 hover:shadow-[0_12px_28px_rgb(180_83_9/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:translate-y-0"
      >
        {open ? (
          <CloseIcon className="h-6 w-6" />
        ) : (
          <ChatBubbleIcon className="h-7 w-7" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[520px] max-h-[75vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_20px_60px_rgb(120_53_15/0.25)] dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-3 border-b border-stone-200/80 bg-amber-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
              <SparkIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-stone-900 dark:text-zinc-100">
                Course Tutor
              </h2>
              <p className="truncate text-xs text-stone-500 dark:text-zinc-400">
                {apiKey
                  ? `Powered by your key (${PROVIDER_PRESETS[provider].label})`
                  : 'Needs your API key to chat'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="AI tutor settings"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <GearIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <CloseIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            {entries.length === 0 && (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-xs leading-relaxed text-stone-600 dark:text-zinc-400">
                  Ask about anything in the course — the tutor knows which lesson
                  you&apos;re on. Or try the example below.
                </p>
              </div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                    entry.role === 'user'
                      ? 'rounded-br-md bg-amber-700 text-white shadow-[0_2px_8px_rgb(180_83_9/0.25)]'
                      : entry.isError
                        ? 'rounded-bl-md border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'rounded-bl-md border border-stone-200/70 bg-stone-100 text-stone-800 shadow-[0_1px_3px_rgb(0_0_0/0.04)] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  {entry.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                  ) : entry.content ? (
                    <ChatMarkdown content={entry.content} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-stone-400 dark:text-zinc-500">
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
                </div>
              </div>
            ))}
            {isStreaming && (
              <p className="px-1 text-xs text-stone-400 dark:text-zinc-500" aria-live="polite">
                The tutor is writing\u2026
              </p>
            )}
          </div>

          <div className="border-t border-stone-200/80 p-3.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleDemo}
              className="mb-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-800 transition-all hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60"
            >
              <SparkIcon className="h-3.5 w-3.5" />
              See an example conversation
            </button>

            {!apiKey ? (
              <div className="rounded-xl bg-stone-100 p-3.5 text-center dark:bg-zinc-800/70">
                <p className="mb-2.5 text-xs leading-relaxed text-stone-600 dark:text-zinc-400">
                  The course works fully without it, but you can add your own API key to chat
                  with the tutor about the material.
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-all hover:-translate-y-px hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0"
                >
                  Add API key
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the tutor\u2026"
                  rows={1}
                  disabled={isStreaming}
                  className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-600"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isStreaming || !input.trim()}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-700 text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-all hover:-translate-y-px hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
