// Output gate for on-device and server model answers (QA R-01, output side).
// PURE ON PURPOSE: no imports at all (a test enforces it), so the Veer worker (W1, T1)
// must copy this file verbatim (CI diff check, or a shared path).
//
// Scope: it catches KNOWN leak shapes. It cannot catch novel confabulation, and a
// partial leak of fewer than RUN words passes. A false reject falls back safely
// (NO_SOURCE on the parametric path, the card answer on the rewrite path).
//
// Pipeline, in this order: NFKC normalise, strip zero-width, line prep, tier 1, tier 2.
// "Segment" = a line after markdown stripping, or one table cell.
//   Tier 1 runs EVERYWHERE (fenced, listed, tabled, unclosed fence).
//   Tier 2 runs outside fences and outside table rows. An unclosed fence is closed at
//   EOF for fence-state purposes only: tier 2 still skips lines after the opening fence.

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

// Tier 1 (everywhere)
const TEMPLATE_MARKER = /<\|[^|>]*\|>|\[\/?INST\]|<<\/?SYS>>|lesson material:|what you already said:/i;
// Colon form only, so top_k and top_k = 64 (code) pass. Not anchored: "Settings - TopK: 64" leaks too.
const ENGINE_CONFIG = /\b(top[ -]?k|top[ -]?p|temp|max[ _]?tokens)\s*:\s*\d/i;
const BACKEND_LINE = /^(cpu|gpu|wasm|webgpu)\s+backend\W*$/i;

// Tier 2 (outside fences and table rows, segment start)
const ROLE_LABEL = /^(system|user|assistant|human|student|learner|tutor)\s*:/i;
const BARE_LABEL = /^(model|temperature|seed)\s*[:=]\s*(-?\d+(\.\d+)?)?\s*$/i;

// Trailing label (everywhere): the answer ends on "Model:"
const TRAILING_LABEL = /\b(model|system|user|assistant|tutor|human)\s*:\s*[.!?]*$/i;

const FENCE = /^\s*```/;

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Strip quote, bullet, number, heading and emphasis wrappers from one segment. */
function prep(segment: string): string {
  // Tags first (never `<|...|>` markers: they start with '<|'), then emphasis, then whitespace runs.
  let s = segment.replace(/<\/?[a-z][^>]*>/gi, '').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/^(>|#+|[-+•]|\d+[.)])\s*/, '')
      .replace(/^_+|_+$/g, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export function sanitizeModelOutput(raw: string, opts: SanitizeOptions): SanitizeResult {
  const reasons = new Set<string>();
  const text = raw.normalize('NFKC').replace(/[​-‏⁠﻿]/g, '');
  if (text.trim().length === 0) reasons.add('empty');

  // Tier 1: n-gram overlap with any system prompt, anywhere in the (normalised) text.
  const leaked = new Set<string>();
  for (const prompt of opts.systemPrompts) {
    const w = words(prompt.normalize('NFKC'));
    for (let i = 0; i + RUN <= w.length; i++) leaked.add(w.slice(i, i + RUN).join(' '));
  }
  const draft = words(text);
  for (let i = 0; i + RUN <= draft.length; i++) {
    if (leaked.has(draft.slice(i, i + RUN).join(' '))) {
      reasons.add('prompt-echo');
      break;
    }
  }

  let inFence = false;
  let lastLine = '';
  for (const line of text.split('\n')) {
    // Markers are checked on the raw line, before any fence handling, table splitting or stripping.
    if (TEMPLATE_MARKER.test(line)) reasons.add('template-marker');
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    const isTable = line.trim().startsWith('|');
    const segments = (isTable ? line.split('|') : [line]).map(prep).filter(Boolean);
    if (segments.length === 0) continue;
    if (!isTable) lastLine = segments[0];
    for (const segment of segments) {
      if (TEMPLATE_MARKER.test(segment)) reasons.add('template-marker');
      if (ENGINE_CONFIG.test(segment)) reasons.add('config-line');
      if (BACKEND_LINE.test(segment)) reasons.add('config-line');
      if (!inFence && !isTable) {
        if (ROLE_LABEL.test(segment)) reasons.add('role-label');
        if (BARE_LABEL.test(segment)) reasons.add('bare-label');
      }
    }
  }
  if (TRAILING_LABEL.test(lastLine)) reasons.add('trailing-label');

  return reasons.size > 0
    ? { text: opts.fallback, rejected: true, reasons: [...reasons] }
    : { text: raw, rejected: false, reasons: [] };
}
