import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { FlatGrandpa } from './FlatGrandpa';
import { useIsDesktop } from '../../lib/useDesktopViewport';

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
 * Placement (grandpa-placement council ruling, 2026-10-27, superseding
 * the 2026-10-24 panel plan): one grandpa per page, one tabbable
 * instance, JS-rendered — never CSS-hidden. Three mutually exclusive
 * mounts, all driven by the one shared (min-width: 1024px) hook
 * (`useIsDesktop`):
 * - Desktop (≥1024px), ALL routes: the sidebar footer. Layout mounts
 *   the 'sidebar' variant as a shrink-0 footer segment of the aside,
 *   sibling after the nav, DOM-last — in-flow, so it can never mask
 *   sidebar lesson titles the way a fixed overlay did in 2024.
 * - Below 1024px, non-lesson routes: the 'card' variant, in-flow at
 *   the end of <main> (Layout mounts KofiBenchCard). No fixed overlay
 *   anywhere: the old fixed bench sat on top of the homepage roadmap
 *   tier cards on mobile once its CTA latch released.
 * - Below 1024px, lessons: KofiBenchDock, the in-flow end-of-lesson
 *   bench (unchanged). At ≥1024px the dock JS-unmounts — the sidebar
 *   instance is the lesson's only grandpa there.
 * Retired with the fixed overlay: the home-route CTA latch and the
 * <650px Q&A yield — compensations with nothing left to compensate.
 */

const ASK_LINE = 'This course runs on coffee. Care to buy me one?';
const ASK_SUB = 'Your refill keeps this course free.';
const CONFIRM_TITLE = "You're heading to Ko-fi.";
const CONFIRM_SUB = 'The course is free, and stays free. A coffee is just a thank-you.';

type BenchVariant = 'sidebar' | 'card' | 'dock';

/**
 * The bench itself, in three placements that share everything else —
 * gates, copy, cloud/confirm flow, focus handling, the figure.
 *
 * Cloud construction differs by placement: in-flow above the figure
 * for 'sidebar' and 'card'; absolutely positioned above the figure in
 * the dock, so its appearance never shifts the lesson content below
 * it. Pacing is dock-only — the sidebar and card pass pace=false.
 */
function BenchCore({ variant }: { variant: BenchVariant }) {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [mode, setMode] = useState<'ask' | 'confirm'>('ask');
  const [seated, setSeated] = useState(false);
  const [pacing, setPacing] = useState(false);
  // The recorded greeting: created on the first tap, never before — no
  // autoplay, no pre-tap fetch. The element lives in a ref so StrictMode
  // double-mounts cannot duplicate it.
  const greetingRef = useRef<HTMLAudioElement | null>(null);
  const playGreeting = () => {
    const el =
      greetingRef.current ??
      new Audio(`${import.meta.env.BASE_URL}kofi-grandpa-greeting.mp3`);
    greetingRef.current = el;
    try {
      // A fresh element has nothing buffered; seeking throws
      // synchronously in some browsers. Playback from the start is the
      // default anyway, so a failed seek just means "play from 0".
      el.currentTime = 0;
    } catch {
      // ignore — play() below still starts from the beginning
    }
    const played = el.play();
    if (played) played.catch(() => {});
  };
  const stopGreeting = () => {
    const el = greetingRef.current;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      // ignore — pausing is what matters
    }
  };
  const askRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirm = useRef(false);
  const reduceMotion = useReducedMotion();

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
      if (e.key === 'Escape') {
        setMode('ask');
        stopGreeting();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // Route-switch unmount must silence a playing greeting. The ref is
  // read inside the cleanup: the element is created lazily on tap, so a
  // mount-time capture would hold null and pause nothing.
  useEffect(
    () => () => {
      greetingRef.current?.pause();
    },
    [],
  );

  if (!kofiUrl || !online) return null;

  const openConfirm = (e: ReactMouseEvent<HTMLElement>) => {
    invokerRef.current = e.currentTarget as HTMLButtonElement;
    // Only the ask -> confirm transition speaks: a figure re-tap while
    // the confirm is already open must not restart the greeting.
    if (mode !== 'confirm') playGreeting();
    setMode('confirm');
  };
  const continueToKofi = () => {
    // Fired directly from the click so the popup keeps its user activation.
    stopGreeting();
    window.open(kofiUrl, '_blank', 'noopener,noreferrer');
    setMode('ask');
  };

  // The cloud: in flow above the figure for the sidebar and card;
  // absolutely positioned above the figure in the dock, so its
  // appearance never shifts the lesson content below it. Its tail
  // lands over grandpa's head in every placement.
  //
  // The border token is stone-500 in both themes (owner-approved
  // contrast fix, 2026-10-27): the old stone-200 on the light page
  // background measured ≈1.2:1 and stone-700 on the dark background
  // ≈1.9:1 — both under the WCAG 1.4.11 3:1 non-text threshold for
  // identifying the button. Stone-500 (#78716c) is the closest stone
  // token that clears it in both themes: 4.59:1 against the light
  // stone-50 background (stone-400 reaches only 2.41:1) and 4.12:1
  // against the dark stone-950 background (stone-600 only 2.59:1).
  // The tail follows the same token so it stays visually coherent.
  const cloudPos =
    variant === 'dock' ? 'absolute bottom-full left-0 mb-2 w-full' : 'relative mb-1 w-full';
  const tailPos =
    variant === 'dock' ? 'left-[104px]' : 'right-[52px] max-[480px]:right-10';
  const tail = (
    <span
      aria-hidden="true"
      className={`absolute -bottom-[5px] ${tailPos} h-3 w-3 rotate-45 border-b border-r border-stone-500 bg-white dark:bg-stone-900`}
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
          className={`${cloudPos} rounded-2xl border border-stone-500 bg-white px-3.5 py-2.5 text-left shadow-[0_10px_30px_rgb(28_25_23/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-stone-900`}
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
          className={`${cloudPos} rounded-2xl border border-stone-500 bg-white px-3.5 py-3 shadow-[0_10px_30px_rgb(28_25_23/0.16)] dark:bg-stone-900`}
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
              onClick={() => {
                setMode('ask');
                stopGreeting();
              }}
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
      className="w-[168px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 max-[480px]:w-[128px]"
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

  if (variant === 'sidebar') {
    return (
      // The min-height reserves the maximum (confirm-state) scene
      // height from first paint — measured from the rendered component
      // (see EVIDENCE_LOG.md, 2026-10-27 entry) — so the sidebar nav
      // region never resizes during walk-in, seating, cloud
      // appearance, or the ask→confirm swap.
      <div
        data-testid="kofi-bench-scene"
        className="relative flex min-h-[256px] w-[212px] flex-col items-start"
      >
        {clouds}
        {figureButton}
      </div>
    );
  }

  return (
    <div
      data-testid="kofi-bench-scene"
      className="relative flex w-[212px] max-w-full flex-col items-start max-[480px]:w-[196px]"
    >
      {clouds}
      {figureButton}
    </div>
  );
}

/** The desktop sidebar footer bench (Layout mounts it in the aside). */
export function KofiBenchSidebar() {
  return <BenchCore variant="sidebar" />;
}

/**
 * IntersectionObserver-gated in-flow mount, shared by the two
 * below-desktop placements: the figure mounts only when the mount
 * scrolls into view, so the walk-in plays for the reader who actually
 * arrives there and never off-screen. A placeholder holds the space
 * until then.
 */
function useInViewGate(enabled: boolean) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || inView) return;
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
  }, [enabled, inView]);

  return { ref, inView };
}

/**
 * The below-desktop card: the same bench in-flow at the end of <main>
 * on non-lesson routes (Layout mounts it only when <1024px and the
 * route is not a lesson). In-flow by construction — it can never
 * overlay the content above it the way the retired fixed bench did.
 */
export function KofiBenchCard() {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const { ref, inView } = useInViewGate(Boolean(kofiUrl));

  if (!kofiUrl) return null;

  return (
    <div ref={ref} data-testid="kofi-bench-card" className="mt-10 flex justify-start">
      {inView ? (
        <BenchCore variant="card" />
      ) : (
        <div aria-hidden="true" className="h-[212px] w-[212px] max-w-full max-[480px]:w-[196px]" />
      )}
    </div>
  );
}

/**
 * The lesson-page dock: the same bench in-flow at the end of a lesson.
 * The figure mounts only when the dock scrolls into view, so the
 * walk-in plays for the reader who actually arrives at the end of the
 * lesson — the gratitude moment — and never off-screen. A same-size
 * placeholder holds the space until then (the cloud is absolutely
 * positioned, so nothing below the dock ever shifts).
 *
 * At ≥1024px the dock JS-unmounts (returns null on the shared desktop
 * query — the same gating pattern as its missing-URL case): the
 * sidebar bench is the lesson's only grandpa on desktop.
 */
export function KofiBenchDock() {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const isDesktop = useIsDesktop();
  const { ref, inView } = useInViewGate(Boolean(kofiUrl) && !isDesktop);

  if (!kofiUrl || isDesktop) return null;

  return (
    // The tall top margin is the cloud's airspace: the cloud hangs
    // absolutely above the figure, so the dock reserves the ~104px it
    // needs to never overlap the share row above it.
    <div ref={ref} data-testid="kofi-bench-dock" className="mt-[104px] flex justify-start">
      {inView ? <BenchCore variant="dock" /> : <div aria-hidden="true" className="h-[118px] w-[212px]" />}
    </div>
  );
}
