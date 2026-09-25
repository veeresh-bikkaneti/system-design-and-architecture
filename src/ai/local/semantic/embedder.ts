/**
 * Ben's understanding layer in the browser: the lesson index and the embedder.
 *
 * Both are served by the course itself (`public/ben/index.json` and
 * `public/models/all-MiniLM-L6-v2/`, built by `npm run ben:index`). Loading
 * starts when the chat opens. If either fails, `loadSemantic()` resolves to
 * null and Ben falls back to the keyword pipeline.
 */
import { loadPipeline } from '../runtime.ts';
import { decodeIndex, normalize, type BenIndex, type RawBenIndex } from './codec.ts';

export type SemanticPhase = 'idle' | 'loading' | 'ready' | 'failed';

export interface Semantic {
  index: BenIndex;
  embed: (text: string) => Promise<Float32Array>;
}

type FeatureExtractor = (
  text: string | string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

const base = (): string => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

let semanticPromise: Promise<Semantic | null> | null = null;
let phase: SemanticPhase = 'idle';
const listeners = new Set<(next: SemanticPhase) => void>();

function publish(next: SemanticPhase) {
  phase = next;
  for (const listener of listeners) listener(next);
}

export function getSemanticPhase(): SemanticPhase {
  return phase;
}

export function subscribeSemantic(listener: (next: SemanticPhase) => void): () => void {
  listeners.add(listener);
  listener(phase);
  return () => listeners.delete(listener);
}

async function fetchIndex(): Promise<BenIndex> {
  const response = await fetch(`${base()}ben/index.json`);
  if (!response.ok) throw new Error(`Ben index: HTTP ${response.status}`);
  return decodeIndex((await response.json()) as RawBenIndex);
}

/** Resolves to null (never throws) when the understanding layer is unavailable. */
export function loadSemantic(): Promise<Semantic | null> {
  if (!semanticPromise) {
    publish('loading');
    semanticPromise = (async () => {
      const [index, extractor] = await Promise.all([
        fetchIndex(),
        // A same-origin path is not a Hub id, so the files come from the course itself.
        loadPipeline<FeatureExtractor>('site', 'feature-extraction', `${base()}models/all-MiniLM-L6-v2`, {
          dtype: 'q8',
          device: 'wasm',
        }),
      ]);
      const embed = async (text: string): Promise<Float32Array> => {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return normalize(Float32Array.from(output.data));
      };
      publish('ready');
      return { index, embed };
    })().catch(() => {
      publish('failed');
      // Let a later chat open retry; this attempt falls back to keywords.
      semanticPromise = null;
      return null;
    });
  }
  return semanticPromise;
}

/** Wait for the layer, but never longer than `ms`: a slow phone gets the keyword answer now. */
export async function semanticWithin(ms: number): Promise<Semantic | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([loadSemantic(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
