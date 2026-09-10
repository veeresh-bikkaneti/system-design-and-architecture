import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAISettingsStore } from '../store/aiSettings';
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
        model: model || 'claude-opus-5',
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
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-violet-700"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[500px] max-h-[70vh] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Tutor</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="AI tutor settings"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {entries.length === 0 && (
              <p className="px-1 text-xs text-slate-400 dark:text-slate-500">
                Ask about anything in the course — or try the example below.
              </p>
            )}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    entry.role === 'user'
                      ? 'bg-violet-600 text-white'
                      : entry.isError
                        ? 'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  {entry.role === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                  ) : entry.content ? (
                    <ChatMarkdown content={entry.content} />
                  ) : (
                    <span className="text-sm text-slate-400">Thinking…</span>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <p className="px-1 text-xs text-slate-400 dark:text-slate-500">Streaming…</p>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <button
              type="button"
              onClick={handleDemo}
              className="mb-2 w-full rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
            >
              See an example ✨
            </button>

            {!apiKey ? (
              <div className="rounded-md bg-slate-50 p-3 text-center dark:bg-slate-800/60">
                <p className="mb-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  This course works fully without it, but you can add your own API key to chat
                  with an AI tutor about the material.
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
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
                  placeholder="Ask the AI tutor…"
                  rows={1}
                  disabled={isStreaming}
                  className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isStreaming || !input.trim()}
                  className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  Send
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
