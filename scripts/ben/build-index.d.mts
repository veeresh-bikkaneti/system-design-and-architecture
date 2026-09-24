// Types for the build-time index script, used by tests and the eval.
import type { RawBenIndex } from '../../src/ai/local/semantic/codec.ts';

export const INDEX_VERSION: number;
export function encodeVectors(rows: number[][]): { data: string; scales: number[] };
export function loadExemplars(): { intent: string; text: string }[];
export function buildIndex(): Promise<RawBenIndex>;
