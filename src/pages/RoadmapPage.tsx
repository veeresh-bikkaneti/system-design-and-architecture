import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { lessons, tierLabels, tierOrder, type Tier } from '../lib/lessons';
import { isLessonUnlocked, isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import { Reveal } from '../components/ui/Reveal';
import { Icon } from '../components/ui/Icon';
import { ProgressBar } from '../components/ui/ProgressBar';

/* ------------------------------------------------------------------ */
/* Tier storytelling: what each chapter covers and what it gives you.   */
/* ------------------------------------------------------------------ */
const tierMeta: Record<
  Tier,
  { tagline: string; covers: string; outcomes: string[] }
> = {
  beginner: {
    tagline: 'Foundations',
    covers:
      'How to think about scale, write code that ages well, and understand the systems you already use every day. No distributed-systems background needed — this is where everyone starts.',
    outcomes: [
      'Trace how a service grows from one server to millions of users',
      'Explain the CAP tradeoff — and why it matters — in plain language',
      'Pick the right database family for the job at hand',
      'Read an architecture diagram without flinching',
    ],
  },
  intermediate: {
    tagline: 'Core systems',
    covers:
      'The building blocks every distributed system is assembled from — caching, queues, gateways, partitioning — plus your first full case study: a URL shortener, designed end to end.',
    outcomes: [
      'Design a URL shortener on a whiteboard, start to finish',
      'Decide when to cache, when to queue, and when to partition',
      'Secure a system: authentication, idempotency, and rate limits',
      'Argue monolith vs. microservices with tradeoffs, not slogans',
    ],
  },
  advanced: {
    tagline: 'Mastery',
    covers:
      'The hard parts — consensus, transactions, failure — plus the modern frontiers: domain-driven design, Instagram- and chat-scale case studies, multi-region active-active systems, GraphQL vs REST, zero trust, and AI agents.',
    outcomes: [
      'Reason about consensus, transactions, and consistency like a senior engineer',
      'Design for failure: breakers, bulkheads, backoff, graceful degradation',
      'Model complex domains with events and anti-corruption layers',
      'Architect RAG and agent-based AI systems at scale',
    ],
  },
};

const finaleOutcomes = [
  'Whiteboard a complete system design — a URL shortener, a photo-sharing app — in 45 minutes flat',
  'Make tradeoffs explicit: consistency vs. availability, latency vs. cost, build vs. buy',
  'Speak the language fluently: sharding, quorums, backpressure, idempotency, bulkheads',
  'Design systems that survive failure — and explain exactly how they do it',
  'Walk into a system design interview with genuine, earned confidence',
];

function TierMilestone({
  tier,
  index,
  completedCount,
  totalLessons,
}: {
  tier: Tier;
  index: number;
  completedCount: number;
  totalLessons: number;
}) {
  const meta = tierMeta[tier];
  const done = completedCount === totalLessons && totalLessons > 0;

  return (
    <div className="relative">
      {/* Milestone badge sitting on the rail */}
      <Reveal className="relative z-10 flex justify-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border-4 font-display text-xl font-semibold shadow-lift ${
            done
              ? 'border-accent-600 bg-accent-600 text-white dark:border-accent-400 dark:bg-accent-400 dark:text-stone-950'
              : 'border-accent-200 bg-white text-accent-800 dark:border-accent-900 dark:bg-stone-900 dark:text-accent-300'
          }`}
        >
          {done ? <Icon name="check" className="h-7 w-7" /> : `0${index + 1}`}
        </div>
      </Reveal>

      <Reveal delay={120} className="mx-auto mt-6 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400">
          {meta.tagline}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
          {tierLabels[tier]}
        </h2>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-stone-600 dark:text-stone-400">
          {meta.covers}
        </p>
        <div className="mx-auto mt-6 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
          {meta.outcomes.map((outcome) => (
            <div
              key={outcome}
              className="flex items-start gap-2.5 rounded-xl border border-stone-200/80 bg-white p-3.5 shadow-soft dark:border-stone-800 dark:bg-stone-900"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-800 dark:bg-accent-950/70 dark:text-accent-300"
              >
                <Icon name="check" className="h-3 w-3" />
              </span>
              <p className="text-sm leading-snug text-stone-700 dark:text-stone-300">{outcome}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-400">
          {completedCount} of {totalLessons} lessons complete
        </p>
      </Reveal>
    </div>
  );
}

export function RoadmapPage() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const journeyRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.meta.estimatedMinutes, 0);
  const nextLesson = lessons.find(
    (lesson) =>
      !completedLessons.includes(lesson.meta.slug) &&
      isLessonUnlocked(lesson.meta.slug, completedLessons),
  );
  const continueLesson = nextLesson ?? lessons[0];

  /* Scroll-driven rail fill: the journey line draws itself as you scroll. */
  useEffect(() => {
    const journey = journeyRef.current;
    const fill = fillRef.current;
    if (!journey || !fill) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fill.style.height = '100%';
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = journey.getBoundingClientRect();
      const viewportAnchor = window.innerHeight * 0.62;
      const progress = Math.min(1, Math.max(0, (viewportAnchor - rect.top) / rect.height));
      fill.style.height = `${progress * 100}%`;
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="pt-4 text-center sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400">
          Course roadmap
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-stone-950 sm:text-5xl dark:text-stone-50">
          The journey from first principles to interview-ready.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
          Thirty lessons in three tiers. Each tier unlocks the next — here is exactly what
          you will cover, and what you will be able to do when each chapter closes. Scroll,
          and watch the path draw itself.
        </p>
        <div className="mx-auto mt-8 max-w-xl">
          <ProgressBar
            value={completedLessons.length}
            max={lessons.length}
            label="Overall course progress"
            size="md"
          />
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            <span className="font-semibold text-stone-700 dark:text-stone-300">
              {completedLessons.length} of {lessons.length}
            </span>{' '}
            lessons complete · {totalMinutes} minutes of content
          </p>
        </div>
      </section>

      {/* The journey */}
      <section ref={journeyRef} className="relative mt-20" aria-label="Learning journey">
        {/* Rail: stone track + accent fill that draws on scroll */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-4 top-0 w-1 -translate-x-1/2 rounded-full bg-stone-200/70 md:left-1/2 dark:bg-stone-800"
        >
          <div
            ref={fillRef}
            className="w-full rounded-full bg-gradient-to-b from-accent-400 to-accent-600 dark:from-accent-500 dark:to-accent-300"
            style={{ height: '0%' }}
          />
        </div>

        {tierOrder.map((tier, tierIndex) => {
          const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
          if (tierLessons.length === 0) return null;
          const tierUnlocked = isTierUnlocked(tier, completedLessons);
          const tierCompleted = tierLessons.filter((l) =>
            completedLessons.includes(l.meta.slug),
          ).length;

          return (
            <div key={tier} className="relative mb-20 last:mb-0">
              <TierMilestone
                tier={tier}
                index={tierIndex}
                completedCount={tierCompleted}
                totalLessons={tierLessons.length}
              />

              <ol className="mt-10">
                {tierLessons.map((lesson, lessonIndex) => {
                  const completed = completedLessons.includes(lesson.meta.slug);
                  const isNext = nextLesson?.meta.slug === lesson.meta.slug;
                  const unlocked = tierUnlocked && isLessonUnlocked(lesson.meta.slug, completedLessons);
                  const alternate = lessonIndex % 2 === 1;

                  const card = (
                    <div
                      className={`relative h-full rounded-2xl border p-5 shadow-soft transition-[transform,box-shadow,border-color] duration-200 ${
                        completed
                          ? 'border-accent-200 bg-accent-50/60 dark:border-accent-900/50 dark:bg-accent-950/20'
                          : 'border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-900'
                      } ${
                        unlocked
                          ? 'hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift dark:hover:border-accent-800'
                          : 'opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-400">
                          Lesson {lesson.meta.order}
                        </p>
                        {isNext && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-accent-400 dark:text-stone-950">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white dark:bg-stone-950" />
                            Up next
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 flex items-center gap-2 font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                        {!unlocked && <Icon name="lock" className="h-4 w-4 shrink-0 text-stone-400" />}
                        {lesson.meta.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                        {lesson.meta.summary}
                      </p>
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-stone-400 dark:text-stone-400">
                        <Icon name="clock" className="h-3.5 w-3.5" />
                        {lesson.meta.estimatedMinutes} min
                        {completed && (
                          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 font-semibold text-accent-800 dark:bg-accent-950/70 dark:text-accent-300">
                            <Icon name="check" className="h-3 w-3" /> Done
                          </span>
                        )}
                      </p>
                    </div>
                  );

                  return (
                    <li key={lesson.meta.slug} className="relative pb-8 pl-12 md:pl-0">
                      {/* Node on the rail */}
                      <span
                        aria-hidden="true"
                        className={`absolute left-4 top-8 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 md:left-1/2 ${
                          completed
                            ? 'border-accent-600 bg-accent-600 text-white dark:border-accent-400 dark:bg-accent-400 dark:text-stone-950'
                            : isNext
                              ? 'border-accent-600 bg-white text-accent-700 dark:border-accent-400 dark:bg-stone-950 dark:text-accent-300'
                              : 'border-stone-300 bg-white text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-600'
                        }`}
                      >
                        {completed ? (
                          <Icon name="check" className="h-4 w-4" />
                        ) : !unlocked ? (
                          <Icon name="lock" className="h-4 w-4" />
                        ) : (
                          <span className="font-display text-xs font-bold">
                            {lesson.meta.order}
                          </span>
                        )}
                      </span>

                      <Reveal
                        delay={(lessonIndex % 4) * 90}
                        className={`md:w-[calc(50%-3rem)] ${alternate ? 'md:ml-auto' : ''}`}
                      >
                        {unlocked ? (
                          <Link
                            to={`/lesson/${lesson.meta.slug}`}
                            className="block h-full"
                            aria-label={`${lesson.meta.title}${completed ? ' (completed)' : ''}`}
                          >
                            {card}
                          </Link>
                        ) : (
                          <div aria-disabled="true" className="h-full cursor-not-allowed">
                            {card}
                          </div>
                        )}
                      </Reveal>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}

        {/* Finish line */}
        <div className="relative pb-4 pt-4">
          <Reveal className="relative z-10 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-accent-600 bg-stone-950 text-accent-300 shadow-lift dark:border-accent-400 dark:bg-accent-400 dark:text-stone-950">
              <Icon name="medal" className="h-7 w-7" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-accent-200 bg-accent-50 p-8 shadow-lift sm:p-10 dark:border-accent-900/60 dark:bg-accent-950/30">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400">
                Finish line
              </p>
              <h2 className="mt-2 text-center font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                By the end of this course, you will be able to…
              </h2>
              <ul className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
                {finaleOutcomes.map((outcome, i) => (
                  <Reveal key={outcome} delay={i * 80}>
                    <li className="flex h-full items-start gap-3 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-soft dark:border-stone-800 dark:bg-stone-900">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-600 font-display text-xs font-bold text-white dark:bg-accent-400 dark:text-stone-950"
                      >
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                        {outcome}
                      </p>
                    </li>
                  </Reveal>
                ))}
              </ul>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {continueLesson && (
                  <Link
                    to={`/lesson/${continueLesson.meta.slug}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300 dark:active:bg-accent-200"
                  >
                    {completedLessons.length > 0 ? 'Continue your journey' : 'Start the journey'}
                    <Icon name="arrowRight" />
                  </Link>
                )}
                <Link
                  to="/badges"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-accent-800 dark:hover:text-accent-300"
                >
                  <Icon name="medal" />
                  View badges
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
