#!/bin/sh
# usage: run.sh <variant: main|c1|c2|both> <batch> <tag>
set -e
cd "$(dirname "$0")/../m3"
cp ../_scratch/router.$1.ts src/ai/local/semantic/router.ts
BATCH=$2 DIAG=../_scratch/out/$3.json npx vitest run --config vitest.eval.config.ts > ../_scratch/out/$3.log 2>&1 || true
cp evals/ben/REPORT.md ../_scratch/out/$3.REPORT.md
grep -E "Tests |skipped|✓|×" ../_scratch/out/$3.log | tail -10
