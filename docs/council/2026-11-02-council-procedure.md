# Council record: the council procedure (PR #172)

Change: add "Council procedure (constitution)" to AGENTS.md section 3 (frozen core), at the owner's direction.

Panel: **two seats, not the full four.** Their goals were set for this text: a Skeptic and a consistency Historian. The 3-of-4 pass rule does not apply to a two-seat panel. Both voted SUPPORT WITH CHANGES, no dissent. Chair of record: the owner. Council lead: Sonnet 5.5.

Deviation: this record was written after the first advisor call, not before. The rule it adds (step 3) was found necessary by that call.

## Round 1

| Seat | Model | Vote |
|---|---|---|
| C Skeptic | sonnet | SUPPORT WITH CHANGES (6 blocking, 4 non-blocking) |
| D Historian / consistency | haiku | SUPPORT WITH CHANGES |

### Seat C (Skeptic), report

Blocking:
1. Two Chairs. The existing Chair owns the decision and may veto (section 3; section 11 names Liz). "Sonnet 5.5 chairs the council" is a second Chair. Replace with a Council Clerk with no vote and no veto.
2. "Repeat until they agree" against section 9 is unbounded, and step 6 mixes two rounds with three fix loops. Say each reconvene is a round; after round 2, BUDGET EXCEEDED.
3. Token budget. Five seats, a verdict, an advisor call and a loop almost certainly exceed 15,000 tokens. Say whether they count; only the Chair may authorise more, in writing.
4. "Agrees" is undefined and the Clerk could game it. The advisor replies exactly AGREE / AGREE WITH NOTES / DISAGREE, recorded verbatim. A material finding changes safety, scope, tier, or acceptance conditions.
5. Independence. Send the advisor the unedited seat reports, not only the verdict.
6. "Contested" has no owner. Mandatory for T1; for T2 the advisor check is mandatory and the full council optional; contested means any seat dissents or the Chair or a seat says so in writing; not required for T3.

Non-blocking:
7. Advisor unavailable: stop, do not self-approve. If all seats ran on one model, record "no model diversity".
8. The record must be on the remote before approval.
9. Name roles with the current model as default.
10. If the Clerk also implements, say so; the advisor's AGREE is required for T1 and T2.

### Seat D (Historian / consistency), report

Verified:
- Chair clash. AGENTS.md:46-48 defines the Chair with a veto, and :169 names Liz. The new step 2 made Sonnet 5.5 a second "Chair".
- The new bounds repeat section 9 and do not conflict with it.
- Past practice. PR #142 used haiku seats A, B, D and sonnet seat C plus an Advisor row, with Chair "pending (owner)".
- Budget. capsule-inference-ladder.md:27 says the stated 15,000 is not achievable (cheap-model agents spend 80-100k on reading alone) and proposes 60,000. That is a proposal, not a measurement.

Inferred: a mandatory T1/T2 loop will not fit in 15,000 tokens.

Edits:
1. Call it "council lead (Sonnet 5.5, not the Chair)".
2. Replace "or a decision is contested" with "or a T1/T2 decision needs one".
3. Council and advisor tokens count against section 7's 15,000, or a separate cap the Chair decides.
4. Add a testable PR-body checklist: verdict line, seat table, advisor line, loop count (n of 2).

Placement in section 3 is correct.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt with changes:
- The lead is not a second Chair.
- Roles are named, with the current model as the default.
- Each reconvene counts as a round, maximum two, then BUDGET EXCEEDED.
- The advisor replies AGREE / AGREE WITH NOTES / DISAGREE and sees the unedited seat reports; only material findings loop.
- Full council for T1 and frozen-core changes; T2 gets the advisor check plus Chair and Skeptic; T3 neither.
- Council tokens are tracked apart from the 15,000 under a Chair-set cap (60,000 default, unmeasured).
- The record goes on the remote under a fixed checklist.

### Advisor (Opus), reply, round 1

AGREE WITH NOTES. Your verdict's seven points are faithful to both seat reports and to the owner's four-step intent. I'd implement it. Four notes; one is material by your own definition.

- Material: step 3 is not satisfiable as written. The advisor tool takes no parameters and forwards the whole transcript. You cannot send a curated packet, and nothing the transcript does not contain. On a fresh session, or after context summarisation, the advisor would see a paraphrase. Fix: the lead pastes the seat reports verbatim into the record before the advisor call, and the advisor call happens in the same session as the seats.
- Non-material: the 60,000 figure is unmeasured and sits in the frozen core. State it as "the Chair sets the cap; 60,000 proposed, unmeasured", or move it to docs/agent-notes.md.
- Non-material: step 7's "if the lead model also implements" is always true in practice. Make the advisor's AGREE required for T1 and T2 unconditionally.
- Non-material: "contested" rests on dissent, but both seats voted SUPPORT WITH CHANGES with no dissent, so by the text this very change was not contested. A frozen-core change always runs the loop.
- Process check: two seats ran, not four. Say so plainly rather than letting a reader infer a full council ran.

## Round 2 (of max 2)

Applied: step 3 now pastes the seat reports into the record before the advisor call, in the same session. The 60,000 figure is stated as proposed and unmeasured, with the Chair setting the cap. The implementer conditional became an unconditional advisor requirement for T1 and T2. A frozen-core change always runs the loop (first sentence of the procedure).

### Seat C (Skeptic), round 2 report

Vote: SUPPORT WITH CHANGES. Round-1 blocking findings: #1 two Chairs, resolved; #2 unbounded loop, mostly resolved (step 5 still said "repeat until the advisor agrees"); #3 token budget, partly (no default applies until the Chair sets a cap); #4 "agrees" gameable, partly (nothing says who judges materiality); #5 independence, resolved with a limit; #6 "contested", resolved.

New BLOCKING:
- B1 T2 deadlock. "A T2 task needs ... step 3" applied only step 3, while step 7 requires AGREE for T2; a T2 DISAGREE had no loop and no bound. Fix: "A T2 task runs steps 2 to 7 with only the Chair and Skeptic as seats."
- B2 unbounded spend until the Chair sets a cap. Fix: 60,000 per decision as a provisional default until the Chair sets one.
- B3 materiality gaming. Fix: the advisor labels each note MATERIAL or NON-MATERIAL; the lead may not downgrade a label, only the Chair may.

NON-BLOCKING:
- N1 a PR reader cannot check "verbatim"; push the seat-report commit before the advisor reply is recorded.
- N2 add a fallback if the session ends or is summarised before the advisor replies (re-paste the recorded reports from the remote).
- N3 say "implementation fix loops (§9)" in step 6.
- N4 step 5 should read "Repeat within the bounds of step 6."

### Verdict (council lead, Sonnet 5.5), round 2

Adopt all three blocking fixes and all four non-blocking ones; applied in the revised AGENTS.md at this commit. Round count: 2 of 2. Sent to the advisor next; the reply is recorded in the following commit.
