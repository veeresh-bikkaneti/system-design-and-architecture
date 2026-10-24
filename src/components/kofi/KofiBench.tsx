import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocation } from 'react-router-dom';

import { FlatGrandpa } from './FlatGrandpa';
import { useQaPanelStore } from '../../store/qaPanel';

declare global {
  interface ImportMetaEnv {
    /**
     * Ko-fi page URL for this support ask. A build-time value set per deploy
     * target; never hardcode the URL in source. Unset or empty → the scene
     * does not render.
     */
    readonly VITE_KOFI_URL?: string;
  }
}

/**
 * The Ko-fi ask for System Design Mastery — one grandpa, every state.
 *
 * Grandpa walks in from the left of his frame, crosses in front of the
 * bench, and sits down; only once he is seated does his cloud appear
 * with the ask, and the once-per-load refill follows. Tapping the cloud
 * or grandpa swaps the SAME cloud to a one-step confirm before the
 * Ko-fi page opens in a new tab.
 *
 * One character in every state: the figure is FlatGrandpa, a flat 2D
 * animated SVG drawn from the owner's design reference (flat cap, big
 * mustache, tan blazer — docs/kofi-grandpa-reference.jpg). He walks in,
 * sits, idles, and refills; under reduced motion the same drawing is
 * simply already seated. (The earlier Three.js figure was rejected by
 * the owner — "potato head" — and was removed with its still-render
 * pipeline; one drawing now covers every state by construction.)
 *
 * Fail-closed, like the pattern it rebuilds: no `VITE_KOFI_URL` at build
 * time, or the browser is offline, and the whole scene renders nothing.
 * Adult audience — the confirm is the only step before leaving; there is
 * deliberately no grown-up gate and no Meridian copy or code here.
 *
 * Placement (agency UI/UX panel, 2026-10-24 — unanimous KEEP-WITH-
 * CHANGES, superseding the 2026-10-23 landscape review): bottom-left is
 * the right corner — bottom-right is owned by the Q&A widget (z-50),
 * the modal sits at z-[60], this bench at z-40 — but as one fixed rule
 * for every page it failed three measured contexts, so placement is
 * context-gated:
 * - Desktop home / badges / roadmap: fixed bottom-left, as measured
 *   clean (zero overlap with the Start learning CTA at 1280px).
 * - Mobile home: the bench box fully contained the Start learning CTA
 *   at scroll-top (390px), so below desktop width the bench waits —
 *   renders nothing — until that CTA has scrolled out of the viewport,
 *   then walks in. First paint belongs to the CTA.
 * - Lesson pages: no fixed overlay while reading (he masked sidebar
 *   lesson titles on desktop and the first content heading on mobile).
 *   LessonPage mounts KofiBenchDock instead: the same bench in-flow at
 *   the end of the lesson, walking in when scrolled into view.
 * The Q&A yield rule is unchanged for the fixed bench: below 650px the
 * open panel spans the whole bottom band, so the bench hides
 * (display:none — nothing unmounts; the walk and an open confirm
 * survive) and returns when the panel closes.
 */

const ASK_LINE = 'This course runs on coffee. Care to buy me one?';
const ASK_SUB = 'Your refill keeps this course free.';
const CONFIRM_TITLE = "You're heading to Ko-fi.";
const CONFIRM_SUB = 'The course is free, and stays free. A coffee is just a thank-you.';

type BenchVariant = 'fixed' | 'dock';

/**
 * The bench itself, in two placements that share everything else —
 * gates, copy, cloud/confirm flow, focus handling, the figure.
 *
 * `deferUntilCtaGone` (fixed variant, home route only): below desktop
 * width the bench renders nothing until the hero's Start learning CTA
 * has scrolled out of the viewport. The latch is one-way — once he is
 * in, scrolling back up never dismisses him. If the CTA cannot be
 * found or IntersectionObserver is unavailable, he shows anyway:
 * a missing ask is worse than an early one.
 */
function BenchCore({
  variant,
  deferUntilCtaGone = false,
}: {
  variant: BenchVariant;
  deferUntilCtaGone?: boolean;
}) {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [mode, setMode] = useState<'ask' | 'confirm'>('ask');
  const [seated, setSeated] = useState(false);
  const [pacing, setPacing] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirm = useRef(false);
  const reduceMotion = useReducedMotion();

  // Yield to the Q&A panel on narrow viewports (fixed variant only):
  // while it is open below 650px it covers every fixed spot in the
  // bottom band, this one included.
  const qaOpen = useQaPanelStore((s) => s.open);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 649px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const yielded = variant === 'fixed' && qaOpen && narrow;

  // Below-desktop detection for the mobile-home deferral.
  const [belowDesktop, setBelowDesktop] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setBelowDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const deferralActive = variant === 'fixed' && deferUntilCtaGone && belowDesktop;
  const [ctaGone, setCtaGone] = useState(false);
  useEffect(() => {
    if (!deferralActive || ctaGone) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const findCta = () =>
      [...document.querySelectorAll('a, button')].find((e) =>
        e.textContent?.trim().startsWith('Start learning'),
      );
    const tick = () => {
      if (cancelled) return;
      const el = findCta();
      if (!el) {
        // The hero renders before this lazy chunk loads, so the CTA is
        // normally already here; retry briefly, then fail open.
        if (++tries <= 12) timer = setTimeout(tick, 250);
        else setCtaGone(true);
        return;
      }
      if (typeof IntersectionObserver === 'undefined') {
        setCtaGone(true);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (entries.some((en) => !en.isIntersecting)) {
          setCtaGone(true);
          observer?.disconnect();
        }
      });
      observer.observe(el);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      observer?.disconnect();
    };
  }, [deferralActive, ctaGone]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Focus: onto Continue when the confirm opens; back to the control
  // that opened the confirm (the ask cloud or the grandpa figure) when
  // the cloud returns to the ask.
  useEffect(() => {
    if (mode === 'confirm') {
      wasConfirm.current = true;
      continueRef.current?.focus();
    } else if (wasConfirm.current) {
      wasConfirm.current = false;
      // The ask button remounts when the cloud swaps back, so a stored
      // invoker that was the old ask button is no longer in the document
      // — focus the fresh ask button in that case.
      const invoker = invokerRef.current;
      if (invoker && document.contains(invoker)) invoker.focus();
      else askRef.current?.focus();
    }
  }, [mode]);

  // Escape closes the confirm from anywhere while it is open.
  useEffect(() => {
    if (mode !== 'confirm') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('ask');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  if (!kofiUrl || !online) return null;
  if (deferralActive && !ctaGone) return null;

  const openConfirm = (e: ReactMouseEvent<HTMLElement>) => {
    invokerRef.current = e.currentTarget as HTMLButtonElement;
    setMode('confirm');
  };
  const continueToKofi = () => {
    // Fired directly from the click so the popup keeps its user activation.
    window.open(kofiUrl, '_blank', 'noopener,noreferrer');
    setMode('ask');
  };

  // The cloud: in flow above the figure for the fixed bench; absolutely
  // positioned above the figure in the dock, so its appearance never
  // shifts the lesson content below it. Its tail lands over grandpa's
  // head in both placements.
  const cloudPos =
    variant === 'fixed' ? 'relative mb-1 w-full' : 'absolute bottom-full left-0 mb-2 w-full';
  const tailPos = variant === 'fixed' ? 'right-[52px] max-[480px]:right-10' : 'left-[104px]';
  const tail = (
    <span
      aria-hidden="true"
      className={`absolute -bottom-[5px] ${tailPos} h-3 w-3 rotate-45 border-b border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900`}
    />
  );

  const clouds = (
    <>
      {seated && !pacing && mode === 'ask' && (
        <motion.button
          ref={askRef}
          type="button"
          onClick={openConfirm}
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className={`pointer-events-auto ${cloudPos} rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-left shadow-[0_10px_30px_rgb(28_25_23/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-stone-700 dark:bg-stone-900`}
        >
          <span className="block text-[13px] font-semibold leading-snug text-stone-800 dark:text-stone-100">
            {ASK_LINE}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-stone-500 dark:text-stone-400">
            {ASK_SUB}
          </span>
          {tail}
        </motion.button>
      )}
      {seated && mode === 'confirm' && (
        <motion.div
          role="dialog"
          aria-label="Support this course on Ko-fi"
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className={`pointer-events-auto ${cloudPos} rounded-2xl border border-stone-200 bg-white px-3.5 py-3 shadow-[0_10px_30px_rgb(28_25_23/0.16)] dark:border-stone-700 dark:bg-stone-900`}
        >
          <p className="text-[13px] font-semibold leading-snug text-stone-800 dark:text-stone-100">
            {CONFIRM_TITLE}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-stone-500 dark:text-stone-400">
            {CONFIRM_SUB}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              ref={continueRef}
              type="button"
              onClick={continueToKofi}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setMode('ask')}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
          </div>
          {tail}
        </motion.div>
      )}
    </>
  );

  // The click is guarded in the handler, not by removing it: a pacing
  // or not-yet-seated figure must never be a dead tab stop for keyboard
  // users — the guard and aria-disabled say the same thing.
  const figureButton = (
    <button
      type="button"
      onClick={(e) => {
        if (seated && !pacing) openConfirm(e);
      }}
      aria-disabled={!seated || pacing || undefined}
      aria-label="Buy Grandpa a coffee on Ko-fi"
      className="pointer-events-auto w-[168px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 max-[480px]:w-[128px]"
    >
      <FlatGrandpa
        onSeated={() => setSeated(true)}
        pace={variant === 'dock'}
        frozen={mode === 'confirm'}
        onPacingChange={setPacing}
      />
    </button>
  );

  if (variant === 'dock') {
    return (
      <div data-testid="kofi-bench-scene" className="relative flex w-[212px] flex-col items-start">
        {clouds}
        {figureButton}
      </div>
    );
  }

  return (
    <div
      data-testid="kofi-bench-scene"
      className={`pointer-events-none fixed bottom-24 left-4 z-40 flex w-[212px] flex-col items-end sm:left-5 max-[480px]:w-[196px] ${yielded ? 'hidden' : ''}`}
    >
      {clouds}
      {figureButton}
    </div>
  );
}

/** The fixed bench on its own (non-lesson routes mount the Gate). */
export function KofiBench() {
  return <BenchCore variant="fixed" />;
}

/**
 * The app-shell mount: route-aware placement per the panel plan.
 * Lesson routes render nothing here — LessonPage docks the bench
 * in-flow at the end of the lesson instead. On the home route the
 * mobile deferral applies; everywhere else the fixed bench is
 * immediate.
 */
export function KofiBenchGate() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/lesson/')) return null;
  return <BenchCore variant="fixed" deferUntilCtaGone={pathname === '/'} />;
}

/**
 * The lesson-page dock: the same bench in-flow at the end of a lesson.
 * The figure mounts only when the dock scrolls into view, so the
 * walk-in plays for the reader who actually arrives at the end of the
 * lesson — the gratitude moment — and never off-screen. A same-size
 * placeholder holds the space until then (the cloud is absolutely
 * positioned, so nothing below the dock ever shifts).
 */
export function KofiBenchDock() {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!kofiUrl || inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [kofiUrl, inView]);

  if (!kofiUrl) return null;

  return (
    // The tall top margin is the cloud's airspace: the cloud hangs
    // absolutely above the figure, so the dock reserves the ~104px it
    // needs to never overlap the share row above it.
    <div ref={ref} data-testid="kofi-bench-dock" className="mt-[104px] flex justify-start">
      {inView ? <BenchCore variant="dock" /> : <div aria-hidden="true" className="h-[118px] w-[212px]" />}
    </div>
  );
}
