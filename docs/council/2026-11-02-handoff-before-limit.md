# Council record: never leave work hanging on a limit (PR #183)

Change: one bullet in AGENTS.md section 2 (frozen core) plus a "Handoff checkpoints" section in docs/agent-notes.md, at the owner's direction ("make this a constitution so work does not stay hanging when you hit the limit").
Panel: **one seat** (Skeptic, sonnet), not a full council. A frozen-core change always runs the loop (council procedure), and this text is small and operational; the 3-of-4 pass rule does not apply to a one-seat panel. Council lead: Sonnet 5.5. Chair of record: the owner.

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. The intent is right, but the rule is partly unenforceable as written. Nothing here touches the tier, scope or acceptance conditions, so I found no BLOCKING item under your definition. Items 1 and 2 are the ones I would fix before merge.

Verified: the repo is PUBLIC (`gh repo view`). `.ai-context/` is git-excluded via `.git/info/exclude`, so it is local-only. The session-end hook behaviour and `graphify update` flags are UNVERIFIED (low confidence), taken from the PR text.

1. NON-BLOCKING (fix first), feasibility. "When a limit or session-end warning appears" assumes a warning that may never come, and an agent cannot detect a crash or a hard cap. Checkpoint-at-events is the only real mitigation, so the rule should say so. It should also name the hooks that do exist (PreCompact and SessionEnd, if configured) and mark them UNVERIFIED until checked. Replace the last clause of the bullet with: "No warning is guaranteed, so the checkpoints are the guarantee. Where the harness supplies a limit notice or a PreCompact/SessionEnd hook, treat it as a final checkpoint trigger; do not rely on it."
2. NON-BLOCKING, cost and churn (sections 7, 9). The rule never says "one PR per checkpoint" is banned, but a PR per event would cost about 5 minutes of CI, 3 jobs, per event. Replace step 1 in docs/agent-notes.md with: "Use one rolling handoff branch and one draft PR. Checkpoints are pushes to it, never new PRs. Run `graphify update` only if code changed since the last run. Checkpoint cost counts against the section 7 budget; if it would exceed the budget, write the minimum (state line, head SHA, open-PR list, next action) and report `BUDGET EXCEEDED` per section 9."
3. NON-BLOCKING, merge conflict (section 2 merge rule). "It counts as saved once it is on the remote; merging follows the normal merge rule" is correct. Add explicitly: "A handoff PR gets no merge exemption. A handoff in an unmerged draft PR counts as saved."
4. NON-BLOCKING, freshness test. "Older than the last merge or decision is a defect" cannot be checked as written. Replace with: "The handoff's first line holds UTC time, the SHA of `origin/main`, and `gh pr list` numbers. A reader checks `git rev-parse origin/main` against that SHA. A mismatch means the handoff is stale and the reader re-verifies before acting."
5. NON-BLOCKING, public repo. Add: "Never put local absolute paths, usernames, emails, tokens, session URLs or worktree paths in pushed handoffs. Use branch and PR names." Agent ids and worktree names are ephemeral, so they belong in the local copy only.
6. NON-BLOCKING, record conflict. Section 3 item 7 says a record kept on one machine "does not count". Steps 2 to 4 (memory, `.ai-context`, graph) are local, so say they are "conveniences, not records; only step 1 counts". The graph stays gitignored, which is consistent with the ban on committing derived artifacts.
7. NON-BLOCKING, placement. The bullet is about 190 words in the frozen core, and the frozen core is meant for invariants. Keep one sentence in section 2: "Keep the remote handoff current at every checkpoint (`docs/agent-notes.md`)." Move steps 2 to 5 to the annex.
8. NON-BLOCKING, races. Name an owner: "The session lead edits `triage/NEXT-AGENT.md`. Sub-agents report to the lead and never edit it; on a push rejection, fetch and rebase, never force-push."
9. NON-BLOCKING, wording. "Start no new agents, then stop" conflicts with "finish the list before starting anything new" if the owner still wants a response. Say "then stop" once.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt all nine, applied in the revised text at this commit: the frozen-core bullet is now a short invariant (checkpoints are the guarantee; the handoff is the remote file; no merge exemption; hooks are a final checkpoint, never relied on); the annex holds the steps: one rolling handoff branch and one draft PR; the freshness test (first line: UTC time, origin/main SHA, open PR numbers); exclusions for a public repo (no local paths, usernames, emails, tokens, session URLs, worktree paths, agent ids); the session lead owns the file; local steps (memory, .ai-context, graph only if code changed) are conveniences, not records; checkpoint cost counts against the section 7 budget with a minimum-handoff fallback and BUDGET EXCEEDED; on a limit warning finish and stop.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim (handoff-rule part)

AGREE: the revised rule is sound, implement it. All nine findings are applied. The frozen-core bullet is now a short invariant, the operational detail is in the annex, and the two items the Skeptic flagged as "fix first" are both resolved: checkpoints-are-the-guarantee replaces the unreliable warning assumption, and one rolling branch with one draft PR replaces per-checkpoint PR churn. The public-repo exclusions and the freshness test are real improvements: a reader can check `git rev-parse origin/main` against the handoff's first line and know whether to trust it. Round 1 of 2 closes. No material notes.

One thing to fix while you are in the file, non-material but immediate: the handoff already pushed in #182 violates the exclusion rule just written. `triage/NEXT-AGENT.md` section 6 names `~/.claude/settings.json`, the Orca removal, and the owner's `--dangerously-skip-permissions` usage; section 3 carries agent ids. The repo is public. Strip those to the local `.ai-context/HANDOFF.md` copy and leave branch and PR names in the pushed file. Do it in #182 (still open) rather than a new PR: the rolling-branch principle applies to its own handoff.

### Outcome

Round count: 1 of 2. Advisor: AGREE, no material notes. Implementer: Sonnet 5.5 (council lead). Status: PR #183 ready for review; follow-up applied in #182 (handoff scrubbed to the exclusion rule and given a freshness first line).
