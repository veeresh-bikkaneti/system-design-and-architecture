import { acceptDraft } from './agent.ts';
import { tokenize } from './retrieve.ts';
import { HAS_WEBGPU, loadPipeline } from './runtime.ts';

export const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
export const MODEL_LABEL = 'Qwen2.5-0.5B';

export type ModelPhase = 'idle' | 'loading' | 'ready' | 'failed';

export interface ModelStatus {
  phase: ModelPhase;
  progress: number;
  detail: string;
}

type ChatMessage = { role: string; content: string };
type Generator = (
  messages: ChatMessage[],
  options: Record<string, unknown>,
) => Promise<Array<{ generated_text: string | ChatMessage[] }>>;

let generatorPromise: Promise<Generator> | null = null;
let status: ModelStatus = { phase: 'idle', progress: 0, detail: 'Not loaded' };
const listeners = new Set<(next: ModelStatus) => void>();

function publish(next: ModelStatus) {
  status = next;
  for (const listener of listeners) listener(next);
}

export function getModelStatus(): ModelStatus {
  return status;
}

export function subscribeModel(listener: (next: ModelStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function loadGenerator(): Promise<Generator> {
  if (typeof window === 'undefined') {
    throw new Error('The local model only runs in the browser.');
  }
  if (!generatorPromise) {
    generatorPromise = (async () => {
      publish({ phase: 'loading', progress: 0, detail: 'Fetching Qwen' });
      const hasGpu = HAS_WEBGPU;
      const options = {
        dtype: 'q4',
        progress_callback: (update: { status?: string; progress?: number; file?: string }) => {
          if (update.status === 'progress' && typeof update.progress === 'number') {
            publish({
              phase: 'loading',
              progress: Math.round(update.progress),
              detail: update.file ? `Downloading ${update.file}` : 'Downloading weights',
            });
          }
        },
      };
      let pipe: Generator;
      try {
        pipe = await loadPipeline<Generator>('hub', 'text-generation', MODEL_ID, {
          ...options,
          device: hasGpu ? 'webgpu' : 'wasm',
        });
      } catch (error) {
        if (!hasGpu) throw error;
        pipe = await loadPipeline<Generator>('hub', 'text-generation', MODEL_ID, { ...options, device: 'wasm' });
      }
      publish({ phase: 'ready', progress: 100, detail: 'Running on this device' });
      return pipe;
    })().catch((error: unknown) => {
      generatorPromise = null;
      const message = error instanceof Error ? error.message : 'Could not load the model';
      publish({ phase: 'failed', progress: 0, detail: message });
      throw error;
    });
  }
  return generatorPromise;
}

export function preloadModel(): Promise<void> {
  return loadGenerator().then(() => undefined);
}

function readDraft(raw: unknown): string {
  const row = Array.isArray(raw) ? raw[0] : null;
  const generated =
    row && typeof row === 'object' && 'generated_text' in row
      ? (row as { generated_text: string | ChatMessage[] }).generated_text
      : null;
  if (typeof generated === 'string') return generated;
  if (Array.isArray(generated)) {
    const assistant = [...generated].reverse().find((message) => message.role === 'assistant');
    return assistant?.content ?? '';
  }
  return '';
}

/** Returns null when the model is unavailable or the draft fails the sanity check. */
export async function rewriteWithModel(
  question: string,
  context: string,
  prior: string,
): Promise<string | null> {
  try {
    const generator = await loadGenerator();
    const history = prior ? `What you already said:\n${prior}\n\n` : '';
    const material = context.trim()
      ? context
      : 'None. This question is not covered by a lesson.';
    const output = await generator(
      [
        {
          role: 'system',
          content:
            'You are Ben, a patient tutor talking with a beginner. Stay in that role. Sound like a person: warm, short sentences, everyday words. Two to five sentences. You do not call tools yourself. The page already looked up the lesson or the published page in the material. Explain that material. Never say "I only answer from", "scope", "search_lessons", "OKF", or "notes". If the material names a source, keep that source. Do not invent a lesson that is not in the material.',
        },
        {
          role: 'user',
          content: `${history}Lesson material:\n${material}\n\nStudent: ${question}`,
        },
      ],
      { max_new_tokens: 180, temperature: 0.5, do_sample: true, top_p: 0.9, repetition_penalty: 1.12 },
    );
    const draft = readDraft(output).replace(/^answer:\s*/i, '').trim();
    if (!acceptDraft(draft, question)) return null;
    if (/\bi don't have a lesson\b/i.test(draft) && context.trim().length > 0) return null;
    const sourceTokens = tokenize(context);
    if (sourceTokens.length > 12) {
      const draftTokens = new Set(tokenize(draft));
      const shared = sourceTokens.filter((token) => draftTokens.has(token)).length / sourceTokens.length;
      if (shared > 0.82) return null;
    }
    return draft;
  } catch {
    return null;
  }
}
