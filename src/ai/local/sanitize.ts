// Output gate for on-device and server model answers (QA R-01).
// PURE ON PURPOSE: no imports at all (a test enforces it), so the Veer worker
// can copy this file verbatim in slice W1 (with a CI diff check, or a shared path).
//
// Scope: it catches KNOWN leak shapes (prompt echo, role labels, config-like lines,
// template markers). It cannot catch novel confabulation, and a partial leak of
// fewer than RUN words passes.

export interface SanitizeOptions {
  /** Every system prompt the model was given. */
  systemPrompts: string[];
  /** Deterministic line to return when the draft is rejected. */
  fallback: string;
}

export interface SanitizeResult {
  text: string;
  rejected: boolean;
  reasons: string[];
}

/**
 * Words in a row copied from a system prompt that count as a leak. Evidence: every
 * 8-word window of both prompts is rejected, and the longest run the real Ben card
 * answers share with the prompts is below 8 (see sanitize.test.ts).
 */
const RUN = 8;

const ROLE_LABEL = /^\s*(system|user|student|learner|tutor|assistant|model|human|ai)\s*:/i;
const CONFIG_LINE = /^\s*((topk|top_k|top_p|temp\w*|max_?tokens|seed)\s*[:=]|(cpu|gpu|wasm|webgpu)\s+backend\s*$)/i;
const TEMPLATE_MARKER = /<\|[^|>]*\|>|\[\/?INST\]|<<\/?SYS>>|\{\{[^}]*\}\}|lesson material:|what you already said:/i;
/** Table rows and list items are content, not a transcript: skip the line rules there. */
const TABLE_OR_LIST = /^\s*(\||[-*+]\s|\d+[.)]\s)/;
const FENCE = /^\s*```/;

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function sanitizeModelOutput(raw: string, opts: SanitizeOptions): SanitizeResult {
  const reasons: string[] = [];
  if (raw.trim().length === 0) reasons.push('empty');

  // Rule 1: n-gram overlap with any system prompt, anywhere in the text.
  const leaked = new Set<string>();
  for (const prompt of opts.systemPrompts) {
    const w = words(prompt);
    for (let i = 0; i + RUN <= w.length; i++) leaked.add(w.slice(i, i + RUN).join(' '));
  }
  const draft = words(raw);
  for (let i = 0; i + RUN <= draft.length; i++) {
    if (leaked.has(draft.slice(i, i + RUN).join(' '))) {
      reasons.push('prompt-echo');
      break;
    }
  }

  // Rules 2-4: line shapes, outside fenced code and table/list lines.
  let inFence = false;
  for (const line of raw.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || TABLE_OR_LIST.test(line)) continue;
    if (ROLE_LABEL.test(line)) reasons.push('role-label');
    if (CONFIG_LINE.test(line)) reasons.push('config-line');
    if (TEMPLATE_MARKER.test(line)) reasons.push('template-marker');
  }

  const unique = [...new Set(reasons)];
  return unique.length > 0
    ? { text: opts.fallback, rejected: true, reasons: unique }
    : { text: raw, rejected: false, reasons: [] };
}
