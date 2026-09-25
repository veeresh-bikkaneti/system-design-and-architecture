# Ben's implementation history: challenges and pivots

Ben (the course's AI tutor) went through five architectures before landing on the one described in
[docs/ai-tutor.md](ai-tutor.md). This is the record of why each one was replaced — mainly for
whoever touches this code next, and as the source material for the reusable skill in
`.claude/skills/chatbot-architecture-pivot/`.

## Timeline

### 1. BYOK (bring your own key)

The first design had the student paste their own Anthropic API key into the browser
(`dangerouslyAllowBrowser: true`), stored in `localStorage`. Strictly additive, zero cost to the
course, but it put a real API key in front of every visitor and made "try the tutor" a two-step
process (get a key, paste it in) before anyone saw a single answer. Retired.

### 2. A local SLM in the browser ("WebLLM" era)

Replaced BYOK with a small model running entirely on-device: first SmolLM2-135M, then
Qwen2.5-0.5B-Instruct, loaded via Transformers.js (ONNX, WebGPU/WASM) and downloaded from Hugging
Face on first use. No key, no server, no cost — but two real problems showed up in practice:

- **It crashed browsers.** A ~750 MB model download plus WebGPU/WASM inference is a lot to ask of a
  lower-end device or an older browser; the failure mode wasn't a clean error, it was the tab
  locking up or dying.
- **No memory.** The chat transcript lived in a bare `useState`, not persisted anywhere. A reload —
  or the crash above — lost the whole conversation.

### 3. Two parallel, uncoordinated pivots toward a server

Separately, two different sessions moved the Q&A agent onto a real backend, and neither one saw the
other's work land:

- **PR #28** (merged into `main`) built a genuinely complete Cloudflare Workers AI agent:
  `worker/src/qa/{model,persona,retrieval,tools}.ts`, a LangGraph tool-calling loop, `env.AI`
  binding in `wrangler.toml` (`[ai] binding = "AI"` — no API key, billed to the Cloudflare account),
  server-side retrieval over a chunked lesson index. This was real, reviewed, working code — not a
  stub.
- **PR #32**, started independently and *before* #28's merge was visible to it, reinvented a
  simpler version of the same idea: a stateless Worker proxy calling `env.AI` directly, with the
  browser (not the Worker) owning the conversation via `localStorage`.
- A third branch, started from the same stale point as #32, went a different direction again: it
  wired the Q&A agent to the **external Anthropic Cloud API** (`@anthropic-ai/sdk`,
  `ANTHROPIC_API_KEY` as a Wrangler secret) — a real regression, since it traded "free, no-key
  Workers AI" for "paid, key-gated external API," while a code comment it edited still said the
  plan was Workers AI.

None of this was malicious or even unreasonable in isolation — each branch was a coherent step from
where its own session started. The problem was structural: three lines of work on the same feature,
none of them aware of the others, converging on `main` at different times.

### 4. The user's course correction: reject every server-side option

Once the drift surfaced, the direction was made explicit and absolute: **no Cloudflare Workers AI,
no external API of any kind, 100% client-side inference, on any browser.** This wasn't a
compromise between the three branches above — it explicitly closed off all of them, including the
already-merged, working PR #28 implementation. That is a materially different decision from "clean
up an abandoned draft," and it was called out as such rather than folded in quietly: removing
*shipped, reviewed* functionality is a bigger deal than deleting a stub, and the person driving the
change deserves to know that's what's happening.

### 5. The architecture that shipped

Two tiers, both entirely in the browser (`src/ai/local/inference.ts`):

1. **Chrome's built-in Prompt API** (`window.LanguageModel`) — the browser's own on-device model,
   when it has one. Nothing to download from the site.
2. **WebLLM** (`@mlc-ai/web-llm`), dynamically imported (its own ~6 MB chunk, verified not to be in
   the main bundle) so it only loads when the Prompt API is unavailable.
3. If neither loads, Ben still answers — with the plain grounded lesson text, unreworded. No hard
   failure.

The conversation transcript itself moved out of React state and into `localStorage`
(`useQaHistory.ts`), engine-agnostic, so it survives a reload and a mid-conversation fallback from
one engine to the other is invisible to the user (generation is a stateless call per turn; nothing
lives in either engine's own session object).

Retiring PR #28's real backend meant deleting `worker/src/qa/*`, its route wiring, the `[ai]`
binding, and the `@langchain/*`/`@anthropic-ai/sdk` dependencies — while leaving `wrangler.toml`'s
D1 database and the completely unrelated auth/exam/certificate system (`auth.ts`, `exam.ts`,
`crypto.ts`, migrations `0001`–`0004`) untouched. That separation mattered enough to verify
explicitly (diff review, plus the exam Worker's own 15 tests still passing) rather than assume.

### 6. Removing the last network dependency: Wikipedia

Ben's fallback for general tech questions no lesson covered used to fetch a Wikipedia summary
(`web.ts`'s `searchWeb`) and cite it — a real, if small, network dependency, and not compatible with
the client-side mandate. Replaced with `answerParametrically()`: the same two-tier engine answers
from its own trained knowledge instead, with a system prompt that asks it not to invent sources, and
the reply is labelled distinctly in the UI ("General knowledge overview — not in current lesson
plan," styled differently from a lesson-source citation pill) so a student can never mistake a
guess for something Ben actually checked.

### 7. A live bug: Ben answering as himself for strangers

After shipping, a real conversation surfaced a routing bug: "Who is Michael Keaton" got Ben's
generic about-me answer ("I'm Ben. I tutor this course...") instead of being treated as outside the
course. Root cause, found by tracing the exact code path rather than guessing: the semantic router
had two ways to reach the `self` action — a high-precision regex rule layer, and a second,
**unguarded** branch that trusted the embedding vote's `self` classification on its own. A generic
"who is `<name>`" question can embed close enough to "who are you"-style examples to win that vote
by nearest-neighbor alone, with no rule-layer agreement at all.

Before touching the code, the eval dataset (`evals/ben/{cases,holdout}.json`) was checked
statically for every case expecting `self` — all of them were already caught by the regex rule
layer, confirming the unguarded branch was provably redundant, not a load-bearing feature. It was
removed; an unconfirmed vote now falls through to the rest of the policy table like any other
question. A regression test reproduces the exact failure shape deterministically, without needing
the real embedder.

## What made this hard

- **Independent sessions on the same feature don't know about each other's work**, and `git merge`
  will happily combine two incompatible architectures if you let it — the drift wasn't caught by
  any tool, it was caught by reading actual file contents on `main` before trusting a branch's own
  history.
- **A closed-loop static site's CI has a blind spot for its own deploy workflow**: `deploy.yml`
  only triggers on `push: [main]` or manual `workflow_dispatch`, never on `pull_request` — so a PR's
  green checkmark from CodeQL/GitGuardian alone says nothing about whether `npm run build`, the
  Worker's tests, or the network-dependent `eval:ben` gate actually pass. Every PR in this history
  was manually dispatched on its own branch to get a real signal before merging.
- **A routing bug in an embedding-based classifier isn't visible in the code that looks wrong** —
  `if (vote.intent === 'self')` isn't obviously a bug on its own. Finding it required reproducing
  the exact user-visible symptom, tracing which function produced that exact string, and checking
  the decision logic leading there line by line.
- **"Delete the crashing thing" and "the user's actual instruction" were two different fixes** that
  looked similar from a distance (both "remove the local model") — the first pass would have
  reused Cloudflare Workers AI as the safe, already-working fallback; the explicit, written mandate
  ruled that out too, which only became clear by reading the instruction literally rather than
  inferring the most convenient interpretation of it.

## Sources

This document summarizes the commit history and PR discussion on this repository
(`veeresh-bikkaneti/system-design-and-architecture`, PRs #22, #28, #32, #33, #34) as of the changes
described above. See `docs/ai-tutor.md` for how the shipped architecture actually works, and
`docs/adr/0001-ben-semantic-routing.md` for the router's own design record.
