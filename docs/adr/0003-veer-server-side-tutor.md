# ADR 0003: A server-side tutor (Veer) alongside Ben

- Status: accepted
- Date: 2026-10-26
- Scope: the Veer tutor backend (`worker/src/qa/`, migrations `0005`–`0007`, the
  `DB_QA` D1 binding) and its sign-in surface under `/api/qa/*`. Ben
  (`src/ai/local/`, ADR 0001) is out of scope and unchanged.

## Context

The course has two tutors by design, at two points on one trade-off curve. Ben
answers on-device: instant, offline, private by construction, but too weak to
plan or call tools. Veer is a real agent loop (tool calls over the lesson
corpus, cited answers, per-user memory across devices) running on a
self-hosted model — Llama 3.2 3B served by llama.cpp on the owner's Oracle
Always Free VM, reached through a Cloudflare Tunnel. That requires a Worker
backend, a GitHub sign-in gate (abuse protection: the model calls cost the
owner's compute), and server-side storage of transcripts.

History matters here. PR #33 (`ebd7f6d`, 2026-09-24, "Course Q&A agent:
retire the Worker backend, go 100% client-side") deliberately deleted this
backend from main. The Veer implementation was then built on a side branch
(`feature/course-qa-p1p2`) and never merged. The owner's decision of
2026-10-26 reverses the retirement: provision the worker path, by transplant
onto current main under the T1 Consensus Manifest v2 (council PASS,
unanimous, 2026-10-26) — not by reviving the branch as-is.

## Relationship to ADR 0001

ADR 0001 lists "Constraints that stay fixed". This ADR qualifies **exactly
one** of them, in narrowed form:

- ADR 0001: "**No cloud model.** Nothing the student types goes to a model
  API. GitHub Pages serves static files only."
- Qualified by this ADR to: *nothing the student types leaves the device,
  except questions a signed-in student explicitly sends to Veer, which are
  processed by the owner's own self-hosted model (never a third-party model
  API) and stored server-side as transcripts under the retention rule
  below.* GitHub Pages still serves static files only; Ben's default path
  is unchanged.

The other fixed constraints survive **unamended**:

- "**Phones matter.** … a multi-GB in-browser LLM is out." (Veer adds no
  in-browser model; inference is server-side.)
- "**Lessons, quizzes, and progress must work with Ben absent or broken.**"
  (Ben remains the default tutor and the permanent fallback: when Veer is
  unreachable, unconfigured, or the VM is down, the widget degrades to Ben.)

## Decision

1. **Two tutors, one shell.** Ben is the default engine for everyone,
   signed in or not. Veer is an opt-in escalation inside the same widget
   for signed-in students, with the mode visible to the student. Only
   `/api/qa/*` is login-gated; lessons, quizzes, exam, and gist sync are
   untouched.
2. **Separate QA database.** Veer gets its own D1 (`system-design-mastery-qa`,
   binding `DB_QA`). Migrations `0005`–`0007` apply to it only; the cert/exam
   database keeps `0001`–`0004` only. (One shared-machinery exception:
   `0004`'s generic `rate_limit_counters` table is applied to both
   databases, because the QA per-IP throttle increments it through the
   `DB_QA` binding.) Rationale: blast radius and
   reversibility — the QA experiment can be dropped, re-migrated, or backed
   up without ever touching exam/auth data, and if Veer is ever retired
   again, teardown is one `d1 delete` instead of surgical table drops in a
   live database. Merging two databases later is easy; splitting one is not.
3. **Consolidation.** The whole worker path is provisioned in the owner's
   Cloudflare account (owner decision, 2026-10-26: YES). Stage 0 ground
   truth and the account-topology memo established that the API worker had
   never been deployed anywhere (the Deploy Worker workflow has zero runs)
   and that no D1 database exists in that account — this is a first-ever
   stand-up on a clean slate, not a modification of a live worker.
4. **Transcript retention.** Owner decision, 2026-10-26: YES to a 30-day
   hard delete. Transcripts (`qa_messages`) and checkpoints
   (`qa_checkpoints`) are hard-deleted 30 days after a user's last session
   expires, by the cleanup in `worker/src/qa/retention.ts`, invoked from
   the Worker's scheduled handler (daily cron). The widget's Veer mode
   carries the disclosure sentence: *"Questions you ask Veer are sent to
   this course's own server and are deleted after 30 days."*

## Consequences

- Student text sent to Veer is stored server-side (keyed by GitHub user id)
  until the retention sweep deletes it. This is a real change in privacy
  posture from Ben-only, accepted explicitly by the owner and disclosed in
  the widget (Manifest 2) — it must never ship silently.
- Sessions and OAuth state store SHA-256 hashes only; secrets live in
  `wrangler secret`, never in the repo.
- Rollback: revert the provisioning PR. For the worker (first-ever deploy),
  rollback is the pre-deploy state (no API worker); the GitHub Pages site
  and Ben are unaffected at every step.
