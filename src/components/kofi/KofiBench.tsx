import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import type { GrandpaSceneHandle } from './GrandpaScene';

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
 * The seated Ko-fi ask for System Design Mastery.
 *
 * Grandpa sits on a bench under a tree, mug in hand. He never walks: once
 * per page load a short refill plays (mug raises, a kettle pours, mug
 * lowers), then he sits still. His cloud carries the ask from the start;
 * tapping the cloud or grandpa swaps the SAME cloud to a one-step confirm
 * before the Ko-fi page opens in a new tab.
 *
 * Fail-closed, like the pattern it rebuilds: no `VITE_KOFI_URL` at build
 * time, or the browser is offline, and the whole scene renders nothing.
 * Adult audience — the confirm is the only step before leaving; there is
 * deliberately no grown-up gate and no Meridian copy or code here.
 *
 * The figure is a small procedural Three.js scene (GrandpaScene.ts),
 * lazy-loaded only when this component renders and swapped in when ready;
 * if WebGL is unavailable the flat SVG figure below stays as the fallback.
 * The cloud swap is animated with the Motion library (spring pop).
 *
 * Placement: fixed bottom-right at z-40 — above the page, below the sign-in
 * modal (z-[60]) and below the Q&A widget (z-50). bottom-24 keeps it clear
 * of the Q&A button (bottom-5, h-14) stacked under it.
 */

const ASK_LINE = 'This course runs on coffee. Care to buy me one?';
const ASK_SUB = 'Your refill keeps this course free.';
const CONFIRM_TITLE = "You're heading to Ko-fi.";
const CONFIRM_SUB = 'The course is free, and stays free. A coffee is just a thank-you.';

/** One-shot refill choreography. Reduced motion turns it fully off. */
const REFILL_CSS = `
.kofi-mug, .kofi-kettle, .kofi-stream { transform-box: fill-box; }
.kofi-mug { animation: kofi-mug 3.8s ease-in-out 0.7s 1 both; }
.kofi-kettle { opacity: 0; transform-origin: 15% 85%; animation: kofi-kettle 3.8s ease-in-out 0.7s 1 both; }
.kofi-stream { opacity: 0; animation: kofi-stream 3.8s linear 0.7s 1 both; }
@keyframes kofi-mug {
  0%, 18% { transform: translateY(0); }
  30%, 62% { transform: translateY(-7px); }
  78%, 100% { transform: translateY(0); }
}
@keyframes kofi-kettle {
  0%, 12% { opacity: 0; transform: translate(16px, -10px) rotate(0deg); }
  22% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
  34%, 58% { opacity: 1; transform: translate(0, 0) rotate(-16deg); }
  68% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
  82%, 100% { opacity: 0; transform: translate(16px, -10px) rotate(0deg); }
}
@keyframes kofi-stream {
  0%, 35% { opacity: 0; }
  38%, 55% { opacity: 0.9; }
  58%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .kofi-mug, .kofi-kettle, .kofi-stream { animation: none !important; }
  .kofi-kettle, .kofi-stream { opacity: 0 !important; }
}
`;

/** Seated grandpa on a bench, tree to his left, mug in hand. Original art. */
function BenchFigure() {
  return (
    <svg viewBox="0 0 230 160" className="h-auto w-full" aria-hidden="true" focusable="false">
      {/* ground shadow */}
      <ellipse cx="118" cy="148" rx="104" ry="7" className="fill-stone-900/10" />
      {/* tree, to his left */}
      <path d="M34 146 L40 84 L48 84 L54 146 Z" className="fill-amber-900/80" />
      <circle cx="44" cy="52" r="34" className="fill-teal-700" />
      <circle cx="22" cy="70" r="20" className="fill-teal-600" />
      <circle cx="66" cy="68" r="22" className="fill-emerald-700" />
      {/* bench */}
      <rect x="58" y="86" width="158" height="7" rx="3" className="fill-amber-800" />
      <rect x="58" y="97" width="158" height="7" rx="3" className="fill-amber-800" />
      <rect x="58" y="112" width="158" height="8" rx="3" className="fill-amber-900" />
      <rect x="66" y="120" width="7" height="26" className="fill-stone-700" />
      <rect x="200" y="120" width="7" height="26" className="fill-stone-700" />
      {/* grandpa, seated */}
      {/* legs: thigh forward, shin down (seated, always) */}
      <rect x="146" y="104" width="34" height="11" rx="5" className="fill-stone-600" />
      <rect x="170" y="112" width="10" height="26" rx="4" className="fill-stone-600" />
      <rect x="166" y="136" width="20" height="7" rx="3" className="fill-stone-800" />
      <rect x="118" y="104" width="32" height="11" rx="5" className="fill-stone-500" />
      <rect x="140" y="112" width="10" height="26" rx="4" className="fill-stone-500" />
      <rect x="136" y="136" width="20" height="7" rx="3" className="fill-stone-800" />
      {/* torso: teal sweater */}
      <path d="M112 108 C110 82 118 66 136 64 C154 66 162 82 160 108 C146 114 124 114 112 108 Z" className="fill-teal-700" />
      {/* head: skin, grey curls, beard */}
      <circle cx="136" cy="46" r="17" className="fill-orange-200" />
      <path d="M121 52 C120 66 128 74 136 74 C144 74 152 66 151 52 C146 58 126 58 121 52 Z" className="fill-stone-300" />
      <circle cx="122" cy="36" r="6" className="fill-stone-200" />
      <circle cx="131" cy="30" r="7" className="fill-stone-200" />
      <circle cx="141" cy="30" r="7" className="fill-stone-200" />
      <circle cx="150" cy="36" r="6" className="fill-stone-200" />
      <circle cx="130" cy="46" r="1.8" className="fill-stone-800" />
      <circle cx="143" cy="46" r="1.8" className="fill-stone-800" />
      <path d="M131 53 Q136 57 141 53" className="stroke-stone-700" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* arm + mug (the mug group rises for the refill) */}
      <path d="M156 76 C168 84 172 94 170 104" className="stroke-teal-800" strokeWidth="9" fill="none" strokeLinecap="round" />
      <g className="kofi-mug">
        <rect x="160" y="98" width="19" height="15" rx="3" className="fill-amber-500" />
        <path d="M179 101 C186 101 186 110 179 110" className="stroke-amber-600" strokeWidth="3" fill="none" />
        <rect x="162" y="100" width="15" height="3" rx="1.5" className="fill-amber-900" />
      </g>
      {/* kettle + pour stream (refill only; hidden at rest) */}
      <path className="kofi-stream" d="M196 62 L176 96" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 3" />
      <g className="kofi-kettle">
        <path d="M188 44 L214 44 L218 66 C218 71 214 74 209 74 L193 74 C188 74 184 71 184 66 Z" className="fill-stone-400" />
        <path d="M188 48 L176 60 L182 63 L190 54 Z" className="fill-stone-500" />
        <path d="M192 44 C194 36 208 36 210 44" className="stroke-stone-600" strokeWidth="3" fill="none" />
        <circle cx="201" cy="52" r="2.5" className="fill-stone-600" />
      </g>
    </svg>
  );
}

/**
 * The grandpa figure: the 3D scene when WebGL allows it, the SVG otherwise.
 *
 * The scene module (and Three.js with it) is imported lazily, only after
 * this component has rendered — so visitors who never see the ask (env var
 * unset, offline) never download it. The SVG shows while the scene loads
 * and stays for good if the mount fails (no WebGL). On a successful mount
 * the once-per-load refill is triggered here; the scene itself owns the
 * idle motion and ignores the refill under reduced motion.
 */
function GrandpaFigure() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let handle: GrandpaSceneHandle | null = null;
    let cancelled = false;
    import('./GrandpaScene')
      .then((mod) => {
        if (cancelled || !canvasRef.current) return;
        handle = mod.mountGrandpaScene(canvasRef.current, { reducedMotion: reduceMotion ?? false });
        if (!handle) {
          setSceneState('failed');
          return;
        }
        setSceneState('ready');
        handle.playRefill();
      })
      .catch(() => {
        if (!cancelled) setSceneState('failed');
      });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [reduceMotion]);

  return (
    <div className="relative aspect-[230/160] w-full">
      {sceneState !== 'failed' && (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      )}
      {sceneState !== 'ready' && (
        <div className="absolute inset-0">
          <BenchFigure />
        </div>
      )}
    </div>
  );
}

export function KofiBench() {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [mode, setMode] = useState<'ask' | 'confirm'>('ask');
  const askRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
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

  // Focus: onto Continue when the confirm opens; back to the ask button
  // when the cloud returns to the ask.
  useEffect(() => {
    if (mode === 'confirm') {
      wasConfirm.current = true;
      continueRef.current?.focus();
    } else if (wasConfirm.current) {
      wasConfirm.current = false;
      askRef.current?.focus();
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

  const openConfirm = () => setMode('confirm');
  const continueToKofi = () => {
    // Fired directly from the click so the popup keeps its user activation.
    window.open(kofiUrl, '_blank', 'noopener,noreferrer');
    setMode('ask');
  };

  return (
    <div
      data-testid="kofi-bench-scene"
      className="fixed bottom-24 right-4 z-40 flex w-[228px] flex-col items-end sm:right-5 max-[480px]:w-[196px]"
    >
      <style>{REFILL_CSS}</style>
      {mode === 'ask' ? (
        <motion.button
          ref={askRef}
          type="button"
          onClick={openConfirm}
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className="relative mb-1 w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-left shadow-[0_10px_30px_rgb(28_25_23/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-stone-700 dark:bg-stone-900"
        >
          <span className="block text-[13px] font-semibold leading-snug text-stone-800 dark:text-stone-100">
            {ASK_LINE}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-stone-500 dark:text-stone-400">
            {ASK_SUB}
          </span>
          <span aria-hidden="true" className="absolute -bottom-[5px] right-12 h-3 w-3 rotate-45 border-b border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900" />
        </motion.button>
      ) : (
        <motion.div
          role="dialog"
          aria-label="Support this course on Ko-fi"
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className="relative mb-1 w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-3 shadow-[0_10px_30px_rgb(28_25_23/0.16)] dark:border-stone-700 dark:bg-stone-900"
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
          <span aria-hidden="true" className="absolute -bottom-[5px] right-12 h-3 w-3 rotate-45 border-b border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900" />
        </motion.div>
      )}
      <button
        type="button"
        onClick={openConfirm}
        aria-label="Buy Grandpa a coffee on Ko-fi"
        className="w-[168px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 max-[480px]:w-[128px]"
      >
        <GrandpaFigure />
      </button>
    </div>
  );
}
