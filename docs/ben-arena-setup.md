# Ben arena synthesis (2026-11-01)

Arena pick for the live “how to setup local AI” miss. Shipped as PRs [#130](https://github.com/veeresh-bikkaneti/system-design-and-architecture/pull/130) and [#131](https://github.com/veeresh-bikkaneti/system-design-and-architecture/pull/131) onto `main` (`024db43`, `c4b17dd`). Pre-squash heads: `fix/ben-setup-honest` (`9ea9eb6`) and `fix/ben-set-up-pin` (`66f466b`). Ranking pin kept from [#128](https://github.com/veeresh-bikkaneti/system-design-and-architecture/pull/128) (`fix/ben-ranking-unique-tag`).

Student copy lives in [ai-tutor.md](ai-tutor.md). Router design stays in [ADR 0001](adr/0001-ben-semantic-routing.md).

## Goal

`how to setup local AI` is honest and useful in Chrome, Edge, and Firefox.

## Pick

Base: candidate A. Ranking stays on the #128 unique-tag pin (`local` → `tutor-loop`). Do not undo that pin. Do not answer from Designing AI Systems. Do not clarify a setup verb.

Grafts from candidate B:

- Setup voice: “You don't install a local model for me.”
- Peek first: `typeof LanguageModel` is enough to stop Firefox claiming Chrome's API. Do not key first paint on `getModelStatus()` (still `idle`).
- Four-token miss: `tokenize("how to set up local AI")` is `set, up, local, ai` (4 > `nameBoostMaxTokens` 3). Landed as #131, not in the increment-2 PR.
- Do not graft B's `action: self` or Guide-pin removal. That undoes #128 for “tell me about local AI”.

Cross-judge was skipped. This harness could not spawn a Claude judge against a Grok parent.

## Live reply after #130 / #131

Same text in Chrome, Edge, and Firefox until a later increment probes `LanguageModel.availability()`:

> You don't install a local model for me. I try a page-callable Prompt API if this browser exposes one, then a small WebLLM model on WebGPU. Not every browser exposes that API to the page. Neither engine picks tools or browses, and there is no cloud model.

- Confidence: `High confidence · from How this tutor runs`
- Sources: tutor-loop only. The panel drops Guides, so no Designing AI Systems pill.
- Context: empty, so Qwen does not paraphrase the engines.

## Increment 2 (#130)

Files: `src/ai/local/semantic/router.ts`, `src/ai/local/semantic/turn.ts`, `src/ai/local/semantic/semantic.test.ts`

- `Decision.pinned` from `namedTagLessons`.
- Cite only pinned hits. No 0.03 runner-up window on a pin.
- Unique-tag pins are High. Do not assign `best = 0.55`.
- Lead slug `tutor-loop` uses `setupAnswer()`, not `plain()` / `sectionLead`. Unknown template must not say `Chrome's Prompt API`.

## Four-token follow-up (#131)

`isTutorSetupQuestion` in `namedTagLessons`: setup-ish (`set up` / `setup` / `install`) AND tutor-ish (`local ai` / `webllm` / `prompt api` / `tutor` / `ben`) adds `tutor-loop` even when token count is 4. Do not raise `nameBoostMaxTokens`. Postgres and local redis stay unpinned.

## Rejected

- Chrome-copy-only card tweak
- Clarify between tutor-loop and Designing AI Systems on a setup verb
- Lead Designing AI Systems
- `THRESHOLDS.namedTag = 0.55`
- New `Action: 'setup'`
- Kill the Guide ordinary-word pin in this series
- User-Agent matrix
- Load WebLLM to explain WebLLM
