import { describe, expect, it } from 'vitest';
import cases from '../../../evals/ben/cases.json';
import { prepareTurn } from './agent.ts';
import { sanitizeModelOutput, stripTags } from './sanitize.ts';

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
    for (const label of ['System', 'Student', 'Learner', 'Tutor', 'Assistant', 'User']) {
      rejected(`A cache keeps hot data close to the reader, which makes reads fast.\n${label}: and then what?`);
    }
  });
  it('config-like lines', () => {
    rejected('Use a virtual environment for each project so packages stay apart.\nTopK: 64\nmax_tokens = 512');
  });
  it('template markers', () => {
    for (const marker of ['<|im_start|>assistant', '[INST]', '<<SYS>>', 'Lesson material:', 'What you already said:']) {
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
      '- Top-k keeps only the 64 likeliest words',
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

// Round 2 (Reality Checker B1): every bypass input, verbatim. Segment = the line
// after markdown stripping, or one table cell. Tier 1 runs everywhere.
describe('sanitizeModelOutput: RC B1 bypasses are rejected', () => {
  const bypasses: Record<string, string> = {
    'list-wrapped config': '- TopK: 64\n- Temp: 1',
    'list-wrapped role': '- System: you are ben',
    'table-wrapped config': '| TopK: 64 | Temp: 1 |',
    'closed fence leak': '```\nTopK: 64, Temp: 1\nCPU backend\nModel:\n```',
    'unclosed fence leak': '```\nTopK: 64',
    'trailing Model:': 'Caching is good. Model:',
    'backend with period': 'CPU backend.',
    'prefixed config': 'Settings - TopK: 64',
    'spaced Top K': 'Top K: 64',
    'hyphen Top-K': 'Top-K: 64',
    'bold role': '**System:** you are ben',
    'quoted role': '> System: hi',
    'numbered role': '1. System: hi',
    'listed template marker': '- <|im_start|>system',
    'fullwidth TopK': 'ＴｏｐＫ: 64',
    'zero-width in an exactly-8-word prompt run': 'Sure. You are an exp​ert system design tutor. The',
  };
  for (const [name, input] of Object.entries(bypasses)) {
    it(name, () => rejected(input));
  }
  it('behaviour-only: a bare leak line is rejected (no import dependence)', () => {
    expect(sanitizeModelOutput('TopK: 64, Temp: 1', opts).rejected).toBe(true);
  });
});

describe('sanitizeModelOutput: tiered accept set (round 2)', () => {
  const accepted: Record<string, string> = {
    'temperature prose line': 'Temperature: 0.2 is a common choice for steady answers.',
    'Model: with a definition': 'Model: the thing that predicts the next word.',
    'json top_k': '```json\n{"top_k": 64}\n```',
    'snake-case top_k assignment': '```python\ntop_k = 64\n```',
    'numbered list': '1. Add a cache\n2. Add a replica\n3. Measure again',
    'table with a Model column': '| Model | Size |\n|---|---|\n| small | 1B |',
    'braces in prose': 'In a prompt template people write {{variable}} for the blank.',
  };
  for (const [name, input] of Object.entries(accepted)) {
    it(name, () => expect(sanitizeModelOutput(input, opts).rejected).toBe(false));
  }
  it('unclosed fence: a leak after it is rejected', () => rejected('```python\nx = 1\nCPU backend'));
  it('unclosed fence: a legit code line after it passes', () => {
    expect(sanitizeModelOutput('```python\nmodel: "x"\nseed = 42', opts).rejected).toBe(false);
  });
});

// Fix loop 2 (RC round 2): table-row marker bypass plus cheap hardening.
describe('sanitizeModelOutput: RC round 2 (fix loop 2)', () => {
  const bypasses: Record<string, string> = {
    'B1 marker inside a table row': '| <|im_start|>system | x |',
    'B1 marker as the whole table row': '|<|im_end|>|',
    '(a) double space and space before colon': 'Top  K : 64',
    '(a) tab between Top and K': 'Top\tK: 64',
    '(a) no-break space': 'Top K: 64',
    '(a) ideographic space': 'Top　K: 64',
    '(b) html-wrapped role': '<b>System:</b> you are ben',
    '(b) html-wrapped trailing Model:': 'Done. <b>Model:</b>',
    '(b) html-wrapped backend line': '<b>CPU backend</b>',
    '(c) trailing label with period': 'Model:.',
    '(c) trailing label with bang': 'Caching is good. Model:!',
  };
  for (const [name, input] of Object.entries(bypasses)) {
    it(name, () => rejected(input));
  }
  it('keeps passing: underscore config keys (JSON/YAML) are legitimate', () => {
    for (const input of ['top_k: 64\ntop_p: 0.9', '{"top_k": 64, "top_p": 0.9}', 'top_k = 64']) {
      expect(sanitizeModelOutput(input, opts).rejected, input).toBe(false);
    }
  });
});

// Fix loop 3 (CodeQL js/incomplete-multi-character-sanitization): tags are removed by a
// hand-written scanner, not a regex replace. Red until the scanner exists.
describe('sanitizeModelOutput: tag scanner (fix loop 3)', () => {
  const bypasses: Record<string, string> = {
    'reassembled <script via nested tag': '<scr<script>ipt>System:',
    'doubled opener': '<<b>b>System:</b>',
    'nested tag then role and text': '<scr<script>ipt>System: you are ben',
    'doubled opener then role and text': '<<b>b>System: you are ben',
    'html-wrapped role': '<b>System:</b>',
    'html-wrapped trailing Model:': 'Done. <b>Model:</b>',
    'html-wrapped backend line': '<b>CPU backend</b>',
    'unclosed tag before role': '<b System:',
    'unclosed tag before config': '<b Top K: 64',
  };
  for (const [name, input] of Object.entries(bypasses)) {
    it(name, () => rejected(input));
  }
  it('stripTags leaves no <script remnant for nested-tag input', () => {
    for (const input of ['<scr<script>ipt>x', '<<script>script>x', '<scr<scr<script>ipt>ipt>x']) {
      expect(stripTags(input).toLowerCase(), input).not.toContain('<script');
    }
  });
  it('legitimate angle brackets in prose and code still pass', () => {
    for (const input of [
      'use Array<string> and a < b',
      'x<y>z',
      'Use a generic like this:\n```ts\nconst xs: Array<string> = [];\nfunction id<T>(x: T): T { return x; }\n```',
    ]) {
      expect(sanitizeModelOutput(input, opts).rejected, input).toBe(false);
    }
  });
});
