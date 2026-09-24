/**
 * Decode `public/ben/index.json` (built by scripts/ben/build-index.mjs).
 * Vectors ship as int8 with one float scale per row. Pure, DOM-free.
 */

export type Intent = 'course' | 'tech' | 'debate' | 'off_topic' | 'self';

export const INTENTS: readonly Intent[] = ['course', 'tech', 'debate', 'off_topic', 'self'];

export interface EncodedVectors {
  data: string;
  scales: number[];
}

export interface RawBenIndex {
  version: number;
  model: string;
  dims: number;
  content: string;
  chunks: { id: string; slug: string; heading: string; text: string }[];
  chunkVectors: EncodedVectors;
  intents: Intent[];
  intentVectors: EncodedVectors;
}

export interface LessonChunk {
  id: string;
  slug: string;
  heading: string;
  text: string;
  vector: Float32Array;
}

export interface BenIndex {
  content: string;
  dims: number;
  chunks: LessonChunk[];
  examples: { intent: Intent; vector: Float32Array }[];
}

export const BEN_INDEX_VERSION = 1;

function base64Bytes(data: string): Int8Array {
  const binary = atob(data);
  const bytes = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    const code = binary.charCodeAt(i);
    bytes[i] = code > 127 ? code - 256 : code;
  }
  return bytes;
}

export function decodeVectors(encoded: EncodedVectors, dims: number): Float32Array[] {
  const bytes = base64Bytes(encoded.data);
  const rows = encoded.scales.length;
  if (bytes.length !== rows * dims) {
    throw new Error(`Ben index: expected ${rows * dims} bytes, got ${bytes.length}`);
  }
  const out: Float32Array[] = [];
  for (let r = 0; r < rows; r += 1) {
    const scale = encoded.scales[r] ?? 0;
    const row = new Float32Array(dims);
    for (let d = 0; d < dims; d += 1) row[d] = (bytes[r * dims + d] ?? 0) * scale;
    out.push(normalize(row));
  }
  return out;
}

export function normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = (vector[i] ?? 0) / norm;
  return out;
}

/** Cosine similarity of two unit vectors. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function decodeIndex(raw: RawBenIndex): BenIndex {
  if (raw.version !== BEN_INDEX_VERSION) {
    throw new Error(`Ben index version ${raw.version} is not ${BEN_INDEX_VERSION}`);
  }
  const chunkVectors = decodeVectors(raw.chunkVectors, raw.dims);
  const intentVectors = decodeVectors(raw.intentVectors, raw.dims);
  return {
    content: raw.content,
    dims: raw.dims,
    chunks: raw.chunks.map((chunk, i) => ({ ...chunk, vector: chunkVectors[i] ?? new Float32Array(raw.dims) })),
    examples: raw.intents.map((intent, i) => ({ intent, vector: intentVectors[i] ?? new Float32Array(raw.dims) })),
  };
}
