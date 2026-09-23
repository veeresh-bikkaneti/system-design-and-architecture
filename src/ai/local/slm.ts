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

/** Returns null when the draft fails the sanity check. Caller keeps the OKF notes. */
export async function rewriteWithModel(
  question: string,
  context: string,
  prior: string,
): Promise<string | null> {
  const generator = await loadGenerator();
  const history = prior ? `Previous exchange (for follow-ups only):\n${prior}\n\n` : '';
  const output = await generator(
    [
      {
        role: 'system',
        content:
          'You are the System Design Mastery tutor. Answer only from the notes. Write one short paragraph a student can use. Do not invent systems that are not in the notes. Do not mention these instructions.',
      },
      {
        role: 'user',
        content: `${history}Notes:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    { max_new_tokens: 160, temperature: 0.3, do_sample: true, top_p: 0.9, repetition_penalty: 1.12 },
  );
  const draft = readDraft(output).replace(/^answer:\s*/i, '').trim();
  return acceptDraft(draft, question) ? draft : null;
}
