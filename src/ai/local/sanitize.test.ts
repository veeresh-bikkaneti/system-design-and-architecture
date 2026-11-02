import { describe, expect, it } from 'vitest';
import cases from '../../../evals/ben/cases.json';
import { prepareTurn } from './agent.ts';
import { sanitizeModelOutput } from './sanitize.ts';

// O1 phase 1: contract for the ONE shared output gate (QA R-01). Red until phase 2.
// Copies of the two prompts in inference.ts; phase 2 exports the real ones and
// this file switches to importing them.
const PARAMETRIC =
  'You are an expert system design tutor. The user has asked a general software architecture question that falls outside the specific coursework. Explain the concept concisely using your internal knowledge. Do not hallucinate external sources.';
const REWRITE =
  'You are Ben, a patient tutor talking with a beginner. Stay in that role. Sound like a person: warm, short sentences, everyday words. Two to five sentences. You do not call tools yourself. The page already looked up the lesson or the published page in the material. Explain that material. Never say "I only answer from", "scope", "search_lessons", "OKF", or "notes". If the material names a source, keep that source. Do not invent a lesson that is not in the material.';
const FALLBACK = 'I could not find a source for that, so I will not guess.';
const opts = { systemPrompts: [PARAMETRIC, REWRITE], fallback: FALLBACK };

const rejected = (raw: string) => {
  const result = sanitizeModelOutput(raw, opts);
  expect(result.rejected).toBe(true);
  expect(result.text).toBe(FALLBACK);
  expect(result.reasons.length).toBeGreaterThan(0);
};

describe('sanitizeModelOutput: rejects (QA R-01)', () => {
  it('the observed leak: config lines + prompt sentence + "Model:"', () => {
    rejected(
      'CPU backend\nTopK: 64, Temp: 1\nYou are an expert system design tutor. The user has asked a general software architecture question that falls outside the specific coursework.\nModel:',
    );
  });
  it('a verbatim 8-word run of the parametric prompt buried in a real answer', () => {
    rejected(
      'A venv keeps packages separate per project. The user has asked a general software architecture question that falls outside the specific coursework, so I will keep it short.',
    );
  });
  it('a verbatim run of the rewrite prompt', () => {
    rejected('Sound like a person: warm, short sentences, everyday words. Two to five sentences. A cache stores hot data.');
  });
  it('role-label lines', () => {
    for (const label of ['System', 'Student', 'Learner', 'Tutor', 'Assistant', 'User', 'Model']) {
      rejected(`A cache keeps hot data close to the reader, which makes reads fast.\n${label}: and then what?`);
    }
  });
  it('config-like lines', () => {
    rejected('Use a virtual environment for each project so packages stay apart.\nTopK: 64\nmax_tokens = 512');
  });
  it('template markers', () => {
    for (const marker of ['<|im_start|>assistant', '[INST]', '<<SYS>>', '{{question}}', 'Lesson material:', 'What you already said:']) {
      rejected(`A load balancer spreads requests across servers so none gets overwhelmed. ${marker}`);
    }
  });
  it('empty or whitespace-only output', () => {
    rejected('   \n ');
  });
});

describe('sanitizeModelOutput: accepts', () => {
  it('a normal answer, unchanged', () => {
    const answer =
      'A cache keeps a copy of hot data close to the reader, so most reads never reach the database. The price is staleness: you decide how old a copy may be.';
    expect(sanitizeModelOutput(answer, opts)).toEqual({ text: answer, rejected: false, reasons: [] });
  });
  it('a short phrase shared with the prompt (below the n-gram threshold) is not a leak', () => {
    const answer = 'Think of a system design tutor as a map: it shows routes, not the traffic on them today.';
    expect(sanitizeModelOutput(answer, opts).rejected).toBe(false);
  });
  it('the deterministic fallback line itself passes through (no loop)', () => {
    expect(sanitizeModelOutput(FALLBACK, opts).rejected).toBe(false);
  });
  it('is pure: no imports at all (Veer worker copies it verbatim in W1)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./sanitize.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import/m);
    expect(source).not.toMatch(/require\(|import\(/);
  });
});

// Skeptic item 2: legitimate technical answers must pass. Scope: the gate
// catches known leak shapes; it cannot catch novel confabulation.
describe('sanitizeModelOutput: legitimate technical answers pass', () => {
  it('temperature / top-k explained in prose and a list', () => {
    const answer = [
      'Temperature controls how adventurous the next-word pick is. A low value like 0.2 keeps answers steady; a high one wanders.',
      '- Temperature: 0.2 gives steady answers',
      '- Top-k: 64 keeps only the 64 likeliest words',
      'Top-k and temperature work together.',
    ].join('\n');
    expect(sanitizeModelOutput(answer, opts).rejected).toBe(false);
  });
  it('fenced code containing model: "x" and seed = 42', () => {
    const answer = [
      'Pin the seed so runs repeat:',
      '```python',
      'model: "x"',
      'seed = 42',
      'TopK: 64',
      '```',
      'That makes experiments reproducible.',
    ].join('\n');
    expect(sanitizeModelOutput(answer, opts).rejected).toBe(false);
  });
  it('a table with a Model: cell', () => {
    const answer = ['Compare them like this:', '| Model: | Size |', '|---|---|', '| Model: small | 1B |', 'Smaller ones run on a phone.'].join('\n');
    expect(sanitizeModelOutput(answer, opts).rejected).toBe(false);
  });
  it('a leak OUTSIDE the fence is still caught when a fence is present', () => {
    rejected(['```js', 'const a = 1;', '```', 'TopK: 64, Temp: 1', 'Model:'].join('\n'));
  });
});

// Skeptic item 3: threshold evidence.
describe('sanitizeModelOutput: 8-word threshold evidence', () => {
  const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const windows = (text: string, n: number) => {
    const w = words(text);
    return Array.from({ length: Math.max(0, w.length - n + 1) }, (_, i) => w.slice(i, i + n).join(' '));
  };
  it('every 8-word window of each system prompt is rejected', () => {
    for (const prompt of [PARAMETRIC, REWRITE]) {
      for (const window of windows(prompt, 8)) {
        expect(sanitizeModelOutput(`Sure. ${window}. Anyway.`, opts).rejected, window).toBe(true);
      }
    }
  });
  it('a 7-word partial leak passes (documented limit of the threshold)', () => {
    const window = windows(PARAMETRIC, 7)[0];
    expect(sanitizeModelOutput(`Sure. ${window}. Anyway.`, opts).rejected).toBe(false);
  });
  it('longest run shared by the prompts and the real card answers is below 8 (value printed)', () => {
    const promptWindows = new Set<string>();
    for (const n of [4, 5, 6, 7, 8]) for (const p of [PARAMETRIC, REWRITE]) windows(p, n).forEach((x) => promptWindows.add(x));
    const questions = (cases as { cases: { q: string }[] }).cases.map((item) => item.q);
    let longest = 0;
    for (const q of questions) {
      const answer = words(prepareTurn(q).answer);
      for (let n = 4; n <= 8; n++) {
        for (let i = 0; i + n <= answer.length; i++) {
          if (promptWindows.has(answer.slice(i, i + n).join(' '))) longest = Math.max(longest, n);
        }
      }
    }
    console.log(`LONGEST_SHARED_RUN=${longest} (0 = no shared run of 4 or more words)`);
    expect(longest).toBeLessThan(8);
  });
});

describe('sanitizeModelOutput: false-positive corpus (real Ben answers)', () => {
  const questions = (cases as { cases: { q: string }[] }).cases.map((item) => item.q);
  const answers = questions.map((q) => prepareTurn(q).answer).filter((a) => a.trim().length > 0);
  it('has at least 20 distinct real answers', () => {
    expect(new Set(answers).size).toBeGreaterThanOrEqual(20);
  });
  it('flags none of them', () => {
    const flagged = answers.filter((a) => sanitizeModelOutput(a, opts).rejected);
    expect(flagged).toEqual([]);
  });
});
