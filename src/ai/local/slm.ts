import { acceptDraft } from './agent.ts';

export const MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct';
export const MODEL_LABEL = 'SmolLM2-135M';

/**
 * Loaded from a CDN only when the learner actually asks, so the static
 * GitHub Pages bundle does not contain ONNX. Inference still runs in the
 * browser. There is no model-provider API key.
 */
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';

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
      publish({ phase: 'loading', progress: 0, detail: 'Fetching SmolLM2' });
      const runtime = (await import(/* @vite-ignore */ TRANSFORMERS_URL)) as {
        pipeline: (
          task: string,
          model: string,
          options: Record<string, unknown>,
        ) => Promise<Generator>;
        env: { allowLocalModels: boolean };
      };
      runtime.env.allowLocalModels = false;
      const hasGpu = 'gpu' in navigator;
      const pipe = await runtime.pipeline('text-generation', MODEL_ID, {
        dtype: 'q4',
        device: hasGpu ? 'webgpu' : 'wasm',
        progress_callback: (update: { status?: string; progress?: number; file?: string }) => {
          if (update.status === 'progress' && typeof update.progress === 'number') {
            publish({
              phase: 'loading',
              progress: Math.round(update.progress),
              detail: update.file ? `Downloading ${update.file}` : 'Downloading weights',
            });
          }
        },
      });
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

/** Returns null when the draft fails the sanity check. Caller keeps a spoken fallback. */
export async function rewriteWithModel(
  question: string,
  context: string,
  prior: string,
): Promise<string | null> {
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
          'You are a patient tutor talking with a beginner. Sound like a person: warm, short sentences, everyday words. Two to five sentences. No bullet list of rules. Never say "I only answer from", "scope", "search_lessons", "OKF", or "notes". When lesson material is present, explain that idea as if you are sitting next to them, and a simple analogy is welcome. When the material says the question is not covered, say so kindly in your own words and invite them to ask about scaling a website, caching, queues, or CAP. Do not invent a lesson that is not in the material.',
      },
      {
        role: 'user',
        content: `${history}Lesson material:\n${material}\n\nStudent: ${question}`,
      },
    ],
    { max_new_tokens: 180, temperature: 0.5, do_sample: true, top_p: 0.9, repetition_penalty: 1.12 },
  );
  const draft = readDraft(output).replace(/^answer:\s*/i, '').trim();
  return acceptDraft(draft, question) ? draft : null;
}
