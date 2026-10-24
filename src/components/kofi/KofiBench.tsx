import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import type { GrandpaSceneHandle } from './GrandpaScene';
import { useQaPanelStore } from '../../store/qaPanel';
import grandpaStillUrl from './grandpa-seated.png';

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
 * bench, turns, and sits down; only once he is seated does his cloud
 * appear with the ask, and the once-per-load refill follows. Tapping the
 * cloud or grandpa swaps the SAME cloud to a one-step confirm before the
 * Ko-fi page opens in a new tab.
 *
 * One character in every state: the figure is a small procedural
 * Three.js scene (GrandpaScene.ts) whose rig walks, sits, idles, and
 * refills. Wherever the live scene is not on screen — still loading,
 * WebGL unavailable or lost, reduced motion — the figure is
 * grandpa-seated.png, a render OF THAT SCENE (scripts/kofi/
 * render-grandpa-still.mjs), never a separately drawn figure.
 *
 * Fail-closed, like the pattern it rebuilds: no `VITE_KOFI_URL` at build
 * time, or the browser is offline, and the whole scene renders nothing.
 * Adult audience — the confirm is the only step before leaving; there is
 * deliberately no grown-up gate and no Meridian copy or code here.
 *
 * Placement (team landscape review, 2026-10-23): fixed bottom-LEFT at
 * z-40, below the sign-in modal (z-[60]) and the Q&A widget (z-50). The
 * old bottom-right spot sat inside the Q&A panel's box — with the panel
 * open he was 98–100% covered at 390px and 1280px alike. Bottom-left is
 * clear of the Q&A button and the lesson playback button at both
 * widths, and clear of the OPEN panel at desktop width. At mobile width
 * the open panel spans x 20–370 of a 390px viewport, leaving an 80px
 * strip no ~200px-tall fixed widget can occupy — so below 650px the
 * bench hides while the panel is open (it never unmounts; the scene,
 * the walk, and an open confirm all survive the yield) and returns when
 * the panel closes.
 */

/**
 * The refill is once per page load — module scope, so an offline→online
 * remount of the figure (the bench unmounts while offline) cannot replay
 * it. A real page load gets a fresh module and plays it again. It
 * latches when the sit lands and the refill is scheduled, so a mount
 * that unmounts mid-walk does not burn it.
 */
let hasPlayedRefill = false;

const ASK_LINE = 'This course runs on coffee. Care to buy me one?';
const ASK_SUB = 'Your refill keeps this course free.';
const CONFIRM_TITLE = "You're heading to Ko-fi.";
const CONFIRM_SUB = 'The course is free, and stays free. A coffee is just a thank-you.';

/**
 * The grandpa figure: the live 3D scene while it runs, the rendered
 * still of that same scene at every other moment.
 *
 * The scene module (and Three.js with it) is imported lazily, only after
 * this component has rendered — so visitors who never see the ask (env
 * var unset, offline) never download it. The still shows while the scene
 * loads and stays for good if the mount fails (no WebGL) or the context
 * is lost mid-session; both count as "seated" for the cloud, because the
 * still IS the seated grandpa. Under reduced motion the scene is never
 * imported at all: the still shows him seated from the start, no walk.
 *
 * `onSeated` fires exactly once: when the scene reports the sit landed,
 * when the fallback takes over, or immediately under reduced motion.
 */
function GrandpaFigure({ onSeated }: { onSeated: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const seatedRef = useRef(false);
  const onSeatedRef = useRef(onSeated);
  onSeatedRef.current = onSeated;

  useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: no scene, no walk — the still is the seated
      // grandpa, so the cloud may appear at once.
      if (!seatedRef.current) {
        seatedRef.current = true;
        onSeatedRef.current();
      }
      return;
    }
    let handle: GrandpaSceneHandle | null = null;
    let refillTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const becomeSeated = () => {
      if (seatedRef.current) return;
      seatedRef.current = true;
      onSeatedRef.current();
    };
    import('./GrandpaScene')
      .then((mod) => {
        if (cancelled || !canvasRef.current) return;
        handle = mod.mountGrandpaScene(canvasRef.current, {
          reducedMotion: false,
          onContextLost: () => {
            if (cancelled) return;
            handle?.dispose();
            handle = null;
            setSceneState('failed');
            becomeSeated();
          },
          onSeated: () => {
            if (cancelled) return;
            // The refill follows the sit by a beat (it is also queued
            // scene-side if it is ever requested earlier). Latch the
            // once-per-load flag here, when he is actually seated.
            if (!hasPlayedRefill) {
              hasPlayedRefill = true;
              refillTimer = setTimeout(() => handle?.playRefill(), 350);
            }
            becomeSeated();
          },
        });
        if (!handle) {
          setSceneState('failed');
          becomeSeated();
          return;
        }
        setSceneState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setSceneState('failed');
          becomeSeated();
        }
      });
    return () => {
      cancelled = true;
      if (refillTimer) clearTimeout(refillTimer);
      handle?.dispose();
    };
  }, [reduceMotion]);

  if (reduceMotion) {
    return (
      <div className="relative aspect-[230/160] w-full">
        <img src={grandpaStillUrl} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[230/160] w-full">
      {sceneState !== 'failed' && (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      )}
      {sceneState !== 'ready' && (
        <img src={grandpaStillUrl} alt="" aria-hidden="true" draggable={false} className="absolute inset-0" />
      )}
    </div>
  );
}

export function KofiBench() {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [mode, setMode] = useState<'ask' | 'confirm'>('ask');
  const [seated, setSeated] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirm = useRef(false);
  const reduceMotion = useReducedMotion();

  // Yield to the Q&A panel on narrow viewports: while it is open below
  // 650px it covers every fixed spot in the bottom band, this one
  // included. The bench hides (display:none — nothing unmounts, so the
  // scene and any open confirm survive) and returns on close.
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
  const yielded = qaOpen && narrow;

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

  const openConfirm = (e: ReactMouseEvent<HTMLElement>) => {
    invokerRef.current = e.currentTarget as HTMLButtonElement;
    setMode('confirm');
  };
  const continueToKofi = () => {
    // Fired directly from the click so the popup keeps its user activation.
    window.open(kofiUrl, '_blank', 'noopener,noreferrer');
    setMode('ask');
  };

  return (
    <div
      data-testid="kofi-bench-scene"
      className={`fixed bottom-24 left-4 z-40 flex w-[228px] flex-col items-end sm:left-5 max-[480px]:w-[196px] ${yielded ? 'hidden' : ''}`}
    >
      {seated && mode === 'ask' && (
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
      )}
      {seated && mode === 'confirm' && (
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
        onClick={seated ? openConfirm : undefined}
        aria-disabled={!seated || undefined}
        aria-label="Buy Grandpa a coffee on Ko-fi"
        className="w-[168px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 max-[480px]:w-[128px]"
      >
        <GrandpaFigure onSeated={() => setSeated(true)} />
      </button>
    </div>
  );
}
