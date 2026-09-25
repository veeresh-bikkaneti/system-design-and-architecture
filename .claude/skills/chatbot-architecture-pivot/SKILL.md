---
name: chatbot-architecture-pivot
description: Drive an AI chatbot/agent feature through architecture drift, a hard pivot, and a live bug fix like a careful engineer, not a guessing fresh session. Use whenever a chatbot/AI tutor/copilot/agent feature has been touched by more than one session or branch and current state is unclear; whenever the user gives an architecture directive for an AI feature ("no external API," "100% client-side," "stop using provider X") that might conflict with existing code; whenever a chatbot answers wrong, answers as itself when it shouldn't, hallucinates a source, or misroutes a live message and needs a real root cause, not a guess; and whenever a repo's CI doesn't run on pull requests so green checkmarks don't prove the build/tests/eval actually pass. Trigger proactively even for "the bot is doing something weird" or "let's rip out the X integration" — don't wait for the methodology to be named.
---

# Shipping and fixing an AI chatbot feature without guessing

This skill exists because AI chatbot features are unusually easy to get wrong in ways that *look*
fine: the code compiles, the tests you wrote pass, and the bot still answers confidently wrong, or
two well-intentioned sessions quietly build two different backends for the same feature and only
one of them ever gets noticed. It was extracted from a real session that hit all of the failures
below, on a course tutor called "Ben": BYOK → a local model that crashed browsers → two competing
server backends built by different sessions that never saw each other's work → an explicit
architecture mandate that rejected all of them → a two-tier client-side fallback → a live routing
bug traced to one unguarded line of code. Ground every step below in whatever the current project
actually is; the Ben details are illustration, not a template to copy literally.

Work through the phases in order. Not every task needs every phase — a live-bug report skips
straight to phase 4 — but don't skip a phase because it feels like overhead. Each one exists because
skipping it is exactly how the original mess happened.

## Phase 1 — Find out what's actually there, not what you assume is there

Before writing a line of code, check the *base branch*, not just the branch or context you were
handed. A chatbot feature that's been worked on by more than one session is the single biggest
source of wasted work in this space, because:

- Each session's own branch history looks self-consistent from the inside. It's the comparison
  *against the current base branch* that reveals drift — a branch forked before another session's
  work merged has no idea that work exists.
- "This looks unfinished" and "this is already shipped and working" are easy to confuse from a
  branch's own commit messages alone. Read the actual files on the base branch, run its tests, read
  its comments — don't infer completeness from a commit message like "P0 stub."

Concretely: `git fetch` the base branch, diff your working branch against it (not just against
where you started), and for anything chatbot-related, open the real files and read them rather than
trusting a stale summary. If there are multiple open PRs or branches touching the same feature,
list them and read each one's actual diff before deciding which (if any) is the way forward. In the
source session, this step caught a fully-built, reviewed, *merged* Cloudflare Workers AI backend
that two other in-flight branches had no idea existed, because they'd forked before it landed.

If you find genuine drift (two branches solving the same problem differently, or a branch built on
a stale premise), say so plainly before touching anything — don't quietly pick one and proceed. The
person driving the work needs to know the state you found, not just the fix you're about to make.

## Phase 2 — Get the architecture decision in writing, and respect its literal scope

AI feature architecture (which model, which provider, client-side vs. server-side, cost and privacy
trade-offs) is a product decision, not an implementation detail — don't infer it from what's
convenient to build or from what's already half-built. When the direction is ambiguous, or when you
find conflicting prior work (per Phase 1), get an explicit statement from the user of what the
target architecture actually is, and treat that statement as literal scope, not a vibe to
approximate.

Two traps to watch for here:

1. **Substituting the "safe" alternative for the actual instruction.** If a user says "no external
   API calls, ever," don't quietly reach for a different external service (a different cloud
   provider, a different vendor's inference) just because it's already wired up and working — that
   satisfies the letter of "not that specific one" while missing the point. Re-read the instruction
   literally before implementing; if it's genuinely ambiguous, ask, don't guess the convenient
   reading.
2. **Treating "delete shipped code" like "delete a draft."** If satisfying the architecture decision
   means removing functionality that's already merged, reviewed, and live — not just an abandoned
   branch — say that explicitly before or as you do it ("this also means removing the working X
   integration that shipped in PR #N, not just cleaning up drafts"). That is a materially bigger
   deal than tidying up unfinished work, and the person asking for the change deserves to know which
   one they're getting.

## Phase 3 — Implement with graceful degradation, never a hard failure

Chatbot features routinely depend on something that might not be there: a browser API the user's
browser doesn't support, a model that fails to load, a network call that times out. Structure the
implementation as an ordered list of tiers, each one a complete, safe fallback for the one before
it — never a single path that can fail with nothing behind it.

A good shape: try the best option first (e.g., a platform-native capability with zero setup cost),
fall back to a heavier but still-functional option (e.g., a bundled/downloaded model) only if the
first genuinely isn't available, and if *both* fail, fall back to the safest possible degraded
behavior (e.g., plain retrieved text with no generation) rather than an error state. Each tier
should be independently testable, and the fallback chain itself should be exercised by a test, not
just each tier in isolation.

Where the feature has continuity across turns (a conversation), keep that state in something that
outlives any single tier (e.g., persisted client-side storage) rather than inside a particular
engine's own session object — that way a mid-conversation fallback from one tier to another is
invisible to the user instead of losing context.

## Phase 4 — Verify against CI for real, not against what a draft PR shows you

Two specific gotchas that repeatedly produce false confidence:

**A PR's checkmarks can lie about the parts that matter.** Some CI setups (common for static sites
deployed via a single deploy workflow) only trigger that workflow on `push` to the default branch,
not on `pull_request` — so a PR sitting there green might only reflect a security scanner, never the
actual build, test suite, or evaluation gate. Before treating a PR as safe to merge: read the
repo's own workflow files and confirm what triggers on `pull_request` versus only on `push` to the
base branch. If the real gates don't run on PRs, manually dispatch the workflow against your branch
(most CI systems support a manual/dispatch trigger) to get a genuine signal before merging — don't
substitute "the draft PR looks fine" for actually running the checks.

**Local verification has real gaps too, especially anything network- or model-dependent.** A sandbox
or local dev environment often can't reach the same resources CI can (a model registry, an
embedding service). Don't fake or skip that verification — run everything you *can* run locally
(typecheck, unit tests, lint, build), say explicitly which gate you couldn't verify and why, and
treat the CI run as the actual proof for that gate rather than assuming your code is probably fine.

## Phase 5 — Diagnose a live bug by tracing, not guessing

When a chatbot answers wrong in a way a user actually observed, resist the urge to pattern-match to
"probably the prompt" or "probably the model." Instead:

1. **Reproduce the exact output text**, and grep/trace the codebase for the literal function or
   template that produces exactly that string. Chatbot response text is usually assembled by a small
   number of specific code paths — find the one that actually fired, don't reason abstractly about
   what "could" produce something similar.
2. **Trace backward from there** through every condition that had to be true for that path to run.
   Write out the decision chain explicitly (which classifier fired, which threshold was crossed,
   which regex matched or didn't) rather than stopping at the first plausible-looking culprit.
3. **Before writing the fix, check whether it's covered by existing tests or eval data.** If the
   project has a labelled test/eval set for this behavior (routing examples, golden outputs,
   whatever exists), check statically whether your fix could regress any *existing* covered case —
   this can often be done without running the full (possibly expensive/network-dependent) eval, by
   just reading the eval data and reasoning about which cases exercise the code path you're about to
   change. This turns "I think this is safe" into "I checked, and here's why it's safe."

In the source session, this exact process found that a chatbot's embedding-based intent router had
one unguarded branch that trusted a similarity vote with zero rule-layer confirmation — a generic
"who is `<name>`" question could embed close enough to "who are you" examples to win that vote by
nearest-neighbor alone. Checking every existing labelled example against a plain regex rule (no
embedding needed) proved the unguarded branch was redundant for every known case before it was ever
removed.

## Phase 6 — Write a regression test that doesn't need what you don't have

A bug reproduced by tracing the code (Phase 5) can usually be turned into a deterministic unit test
without needing the expensive resource that made local verification hard in the first place — e.g.,
if the real bug needs a live embedding model to reproduce end-to-end, construct a minimal fake
vector/fixture that exercises the same decision branch instead of trying to spin up the real model
in a test. Prefer this over either skipping the regression test or blocking the fix on infrastructure
you don't have.

## Phase 7 — PR hygiene

- Keep the PR in draft until you have a *real* CI signal (per Phase 4), not just typecheck/lint.
- For a CI failure that's pre-existing and unrelated to your change (a dependency advisory on a
  package you didn't touch, a flake): post one comment naming the check, why it isn't this PR's
  problem, and what (if anything) would fix it — don't silently ignore it and don't re-litigate it
  on every subsequent event once you've explained it.
- If Phase 1 surfaced a competing branch/PR for the same feature that your work now supersedes,
  close it explicitly with a one-line explanation pointing at the PR that's taking its place —
  don't just let it go stale.
- Merge once the real gates are green, mark ready-for-review if it was draft, and confirm the actual
  deploy (not just the merge) completes where that's observable — a merged PR isn't the same as a
  live, confirmed-working change.

## Quick checklist

- [ ] Compared my branch against the *current* base branch, not just my starting point
- [ ] Read the actual files/tests on the base branch for anything I'm about to touch or replace
- [ ] Got (or already have, explicitly) the architecture decision in writing, and re-read it literally
- [ ] Flagged explicitly if this removes already-shipped functionality, not just drafts
- [ ] Implementation degrades gracefully through every tier, with a safe final fallback
- [ ] Confirmed what actually triggers CI on a PR vs. only on push, and got a real signal before merging
- [ ] Said explicitly which gates I couldn't verify locally and why
- [ ] For a live bug: traced the exact code path, checked existing test/eval data before fixing
- [ ] Added a regression test that doesn't require the resource I didn't have
- [ ] Closed superseded PRs with an explanation; confirmed the real deploy, not just the merge
