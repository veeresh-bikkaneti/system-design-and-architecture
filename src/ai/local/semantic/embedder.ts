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

/**
 * Bounded wait for the whole understanding-layer load (Branch 1, F1;
 * Consensus Manifest §II.2 Branch 1, verified). Same 30 s value and
 * justification as `PIPELINE_LOAD_TIMEOUT_MS` in `../runtime.ts` (the
 * R-02 pattern, PR #195, re-valued for a ~23 MB same-origin load —
 * Phase 1 §4, verified — not R-02's 120 s / 60 s for a ~750 MB remote
 * download). UNVERIFIED default: no live throttled-network measurement
 * of this load exists.
 */
export const SEMANTIC_LOAD_TIMEOUT_MS = 30_000;

/**
 * Bounded wait for one post-ready `embed()` call. A single embedding of a
 * short question on a loaded WASM model is milliseconds of work (likely —
 * no in-browser timing was measured for this change), and the panel's
 * per-turn patience is already 12 s (`SEMANTIC_WAIT_MS` in
 * `QaChatPanel.tsx`, verified at HEAD), so a call still pending at 12 s
 * is wedged, not slow. The caller falls back to the keyword pipeline.
 */
export const EMBED_TIMEOUT_MS = 12_000;

/** Race `work` against a named bound; a late settle is discarded by the race. */
function bounded<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000} s.`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const base = (): string => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

let semanticPromise: Promise<Semantic | null> | null = null;
let phase: SemanticPhase = 'idle';
const listeners = new Set<(next: SemanticPhase) => void>();

function publish(next: SemanticPhase) {
  phase = next;
  for (const listener of listeners) listener(next);
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
      // The bound is what fixes the F1 wedge (Phase 1 §1 F1, verified):
      // at HEAD a never-resolving load never rejected, so the `.catch`
      // below never ran and `semanticPromise` stayed pending forever —
      // every later turn re-paid the panel's 12 s race and the header
      // stayed on "Getting ready". The timeout makes the load settle:
      // phase `failed`, promise reset, retry unwedged. The underlying
      // fetch/pipeline work cannot be aborted through these APIs
      // (verified at HEAD: neither call takes an abort signal), so a
      // late settle is simply discarded by the race — the same
      // abandon-the-wait semantics as R-02's WebLLM load.
      const [index, extractor] = await bounded(
        Promise.all([
          fetchIndex(),
          // A same-origin path is not a Hub id, so the files come from the course itself.
          loadPipeline<FeatureExtractor>('site', 'feature-extraction', `${base()}models/all-MiniLM-L6-v2`, {
            dtype: 'q8',
            device: 'wasm',
          }),
        ]),
        SEMANTIC_LOAD_TIMEOUT_MS,
        'Semantic load',
      );
      const embed = async (text: string): Promise<Float32Array> => {
        const output = await bounded(
          extractor(text, { pooling: 'mean', normalize: true }),
          EMBED_TIMEOUT_MS,
          'Embedding',
        );
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
