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
  it('has no Ben-specific imports (Veer worker mirrors the spec in W1)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./sanitize.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from\s+['"]\.\//);
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
