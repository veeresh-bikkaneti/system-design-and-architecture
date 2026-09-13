# System Design Mastery — Lesson Style Guide

This guide formalizes the voice every lesson in this course is written in. Read it before
writing or rewriting a lesson; apply all of it, not just the parts you remember.

## 1. The voice

- **Friendly mentor, never condescending.** Write like a senior engineer explaining something
  to a bright colleague over coffee. Explain, don't lecture. Never talk down, never assume
  the reader is lost — assume they're smart and busy.
- **Human-positive, not hype-positive.** Frame ideas by what the reader *gains* and what is
  empowering about them — concrete wins, real numbers, named systems. Encouragement should
  sound like a person means it: plain sentences, honest enthusiasm, opinions included. Never
  cheerleader hype ("game-changing," "mind-blowing," "incredible") and never bland
  corporate-positive. A sentence that could sit in any company's white paper is a sentence
  that failed.
- **Direct and concrete.** Prefer plain sentences and specific examples over abstractions.
  If a sentence works without jargon, keep it that way. Concrete nouns (a queue, a server,
  a 2 a.m. page) beat abstractions (the landscape, the paradigm).
- **Rhythm like speech.** Vary sentence lengths. Use contractions. Drop an occasional short
  fragment for emphasis. If every sentence is the same careful length, it reads like it was
  generated — because it reads like everything else.
- **Keep the personality.** Opinions, dry asides, running jokes — those are the point.
  A human writer takes a stance; keep sentences that sound like a person typed them.
- **Second person.** Address the reader ("you'll see," "your system") — the course is a
  conversation, not a textbook.

## 2. The analogy rule: one vivid analogy per core concept

- Every core concept gets **exactly one** vivid, concrete, everyday analogy — restaurants,
  traffic, post offices, libraries, coffee shops, airports. Things the reader has physically
  experienced.
- **Reuse the analogy within the lesson** (extend it, callback to it) rather than
  introducing a new one per section. One analogy, stretched well, beats five half-built ones.
- Map each technical term to a specific part of the analogy and say the mapping out loud
  (e.g., "the phone line between the diners is the network partition").
- Drop the analogy when precision requires it — teach with the analogy, then state the
  precise definition underneath. The analogy builds intuition; the definition is what the
  reader keeps.

## 3. Humor rules

- **Light running jokes only.** A recurring gag (the network gremlins, Rita the host needing
  a bathroom break) that threads through the lesson is welcome.
- **Humor must support the concept, never distract from it.** A joke is a memory hook for
  the idea, not a detour. If a reader could remember the joke and forget the concept, cut
  the joke.
- **Never forced.** If you have to strain for a punchline, skip it. One genuine line beats
  three labored ones. No memes, no snark at the reader's expense, no inside jokes the reader
  can't share.
- Keep it clean, kind, and professional — the joke is always *with* the reader.

## 4. Lesson structure

1. **The `meta` export first, unchanged schema.** `slug`, `title`, `tier`, `order`,
   `summary`, `estimatedMinutes` — exact keys, exact slugs/tiers/order. Never invent a new
   slug or renumber lessons in a rewrite.
2. **`## Why this matters` hook.** Every lesson opens with a hook that answers: *why should
   I care?* Use a real-world trigger — an outage postmortem, an interview question, a scale
   problem the reader will hit. The hook promises the payoff; the lesson delivers it.
3. **Body sections** build in this order: analogy-first intuition, precise definition,
   mechanisms/trade-offs, failure modes and real systems.
4. **`## Takeaways`.** Numbered, skimmable, self-contained. A reader who reads only the
   takeaways should walk away with the gist.
5. **`<Quiz>`.** See §7.
6. **`## Sources & further reading`.** See §8.

## 5. Progressive complexity tiers

Calibrate depth to the lesson's tier — never front-load advanced material into a beginner
lesson:

- **Beginner = intuition + analogy.** The reader should leave *understanding the idea* in
  their bones. Lean on the analogy, use everyday language, and define every term as you
  introduce it.
- **Intermediate = trade-offs + real systems.** Name the options, compare them honestly,
  and cite real systems that made different choices (Cassandra vs. MongoDB, etc.). The
  reader learns that engineering is choosing which pain to accept.
- **Advanced = failure modes + numbers.** Edge cases, worst-case behavior, quantitative
  reasoning (latencies, throughput, quorum math). The reader learns what breaks at the
  limit and how to measure it.

## 6. Diagram guidance

- **At least two mermaid diagrams per lesson**, fenced as ` ```mermaid ` blocks. They must
  render — verify with a real build.
- **One diagram per major mechanism or section.** If a section describes a flow (routing,
  failover, fan-out), it earns a diagram. If the diagram just repeats the paragraph,
  delete one of them.
- Prefer `flowchart` and `sequenceDiagram` — they read well at a glance. Label arrows and
  notes with the analogy's vocabulary where it helps ("the phone line is down"), not just
  technical terms.
- Keep diagrams small: 3–6 nodes. A diagram with twelve boxes is a diagram nobody reads.

## 7. Quiz-writing rules

- **3+ questions per lesson** (beginner: 3–4; intermediate+: 4–5).
- **Every question must be answerable from the lesson text alone.** No outside knowledge
  required, no trick questions. Quiz semantics must be preserved across rewrites — you may
  improve wording, but the correct answer stays derivable from the text.
- **`correctIndex` must be plausible**, not always 0 or 1 — vary positions so the right
  answer can't be guessed by pattern.
- Distractors should be *tempting wrongs*: common misconceptions named in the lesson, or
  near-miss phrasings. Never make the correct answer identifiable by length, tone, or
  being the only serious option.
- Match the lesson's tier: beginner quizzes test recall and analogy-mapping; intermediate
  quizzes test trade-off judgment.
- Props shape (do not change): `<Quiz lessonSlug="..." questions={[{ question, options,
  correctIndex }]} />`.

## 8. Citation convention

- **Primary/canonical sources only.** Original papers (Brewer 2000, Gilbert & Lynch 2002),
  canonical books (Kleppmann; the SRE book; Gray & Reuter), and official documentation
  (NGINX, HAProxy). No blog rehashes, no listicles.
- One line per source: author(s), title, venue/year — plus the specific contribution when
  it's not obvious ("the formal proof," "introduces the PACELC extension").
- Every substantive technical claim the lesson teaches should trace to something in the
  sources section or be common engineering knowledge the sources would corroborate.

## 9. MDX safety checklist

- `export const meta` is the only export; keep the schema exact.
- No unescaped `{` / `}` in prose, no stray `<` or `</` outside components.
- `<Quiz>` is the only JSX component in lesson files; never add others without checking
  `src/App.tsx`'s `mdxComponents`.
- Run `npm run build` before committing — MDX errors break the build, and the build is
  the linter.

## 10. The slop blacklist: words and tics that fail the voice

AI-generated prose has a recognizable accent. These markers never survive a tone pass:

- **The words:** *delve*, *tapestry*, *vibrant*, *robust* (outside a quoted title), *leverage*
  (as a verb for "use"), *unlock*/*unleash* (for "enable"), *game-changer*, *cutting-edge*.
- **The phrases:** "in today's fast-paced world," "it's worth noting / it's important to
  note," "moreover / furthermore / in conclusion," "whether you're a beginner or a seasoned
  pro," "let's dive in / dive deep," "buckle up," "the truth is," "boils down to,"
  "testament to," "this one trick," "not only X but also Y" parallelisms.
- **The tics:** opening with "Imagine..." more than once per course; stacked rhetorical
  questions that answer themselves; em-dash asides in every sentence (a few per section is
  style, one per sentence is a crutch); "In summary" closers; paragraphs that sound
  important but say nothing.
- **The test:** if a paragraph could be dropped into any company's white paper without
  changing a word, rewrite it until it couldn't. Human-positive means it sounds like *someone*
  — the coffee-chat mentor of §1, with opinions, concrete examples, and the running jokes —
  not like *no one in particular*.

Tightening never changes technical meaning. If a fix would alter what a sentence claims
about a system, a protocol, or a number — don't make it; leave the sentence alone.
