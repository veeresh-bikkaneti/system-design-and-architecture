// Types for the build-time embedder, used by the eval.
export const EMBEDDER_REPO: string;
export const EMBEDDER_NAME: string;
export const EMBEDDER_DTYPE: string;
export const EMBEDDER_DIMS: number;
export const EMBEDDER_FILES: Record<string, string>;
export const embedderDir: string;
export function ensureEmbedder(): Promise<string>;
export function loadNodeEmbedder(): Promise<(texts: string[]) => Promise<number[][]>>;
export const ORT_FILES: string[];
export function copyRuntimeAssets(): string;
