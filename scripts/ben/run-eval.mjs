// `npm run eval:ben` without a shell. The old one-liner used `;` and `$?`, which
// cmd.exe reads as part of the config filename. Node spawning node is boring and works everywhere.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// vitest's exports map hides its entry from resolve(), so point at the file directly.
const vitest = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));
const { status } = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.eval.config.ts'], { stdio: 'inherit' });

// Print the report pass or fail, so a red gate still tells you why.
try { console.log(readFileSync('evals/ben/REPORT.md', 'utf8')); } catch { console.log('(no evals/ben/REPORT.md: the eval died before writing one)'); }
process.exit(status ?? 1);
