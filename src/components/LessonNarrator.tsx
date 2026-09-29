import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { ListenButton } from './ListenButton';
import { extractLessonBlocks } from '../lib/listen';
import {
  alignBlocks,
  findActiveWordIndex,
  flattenWords,
  narrationAudioUrl,
  narrationJsonUrl,
  type FlatWord,
  type NarrationManifest,
} from '../lib/narration';
import {
  BLOCK_ACTIVE_CLASS,
  WORD_ACTIVE_CLASS,
  WORD_SPAN_CLASS,
  unwrapSpans,
  wrapWordSpans,
} from '../lib/narrate-dom';

type Status = 'idle' | 'playing' | 'paused';

const SPEEDS = [0.9, 1, 1.25, 1.5] as const;

const pillClass =
  'inline-flex items-center gap-1.5 border border-stone-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-800 dark:hover:text-accent-300';

const segmentClass = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-stone-950'
      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
  }`;

const fmtTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const isValidManifest = (value: unknown): value is NarrationManifest => {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.slug === 'string' &&
    typeof m.duration === 'number' &&
    typeof m.audio === 'string' &&
    Array.isArray(m.blocks) &&
    m.blocks.every(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as { text: string }).text === 'string' &&
        Array.isArray((b as { words: unknown }).words),
    )
  );
};

interface TaggedBlock {
  el: Element;
  /** Flat-word index of the block's first word. */
  flatStart: number;
  /** Flat-word index one past the block's last word. */
  flatEnd: number;
  wordTagged: boolean;
}

/**
 * Neural narration player: plays the build-time generated opus audio and
 * karaoke-highlights the exact word being spoken, driven by
 * `audio.currentTime` + requestAnimationFrame against the manifest's
 * per-word timestamps.
 *
 * Playback speed changes need no timing compensation: word timestamps are
 * in media time, and `currentTime` advances in media time too.
 */
function NeuralPlayer({
  slug,
  manifest,
  articleSelector,
  onUseBrowserVoice,
}: {
  slug: string;
  manifest: NarrationManifest;
  articleSelector: string;
  onUseBrowserVoice: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [speed, setSpeed] = useState<number>(1);
  const [progress, setProgress] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flatRef = useRef<FlatWord[]>([]);
  const taggedRef = useRef<Array<TaggedBlock | null>>([]);
  const spansRef = useRef<Array<HTMLSpanElement | null>>([]);
  const activeRef = useRef<{ word: number; block: number }>({ word: -1, block: -1 });
  const rafRef = useRef(0);
  const lastProgressRef = useRef(-1);
  const statusRef = useRef<Status>(status);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotionRef = useRef(false);

  const audioUrl = useMemo(() => narrationAudioUrl(slug, manifest), [slug, manifest]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'matchMedia' in window) {
      reducedMotionRef.current = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
    }
  }, []);

  const clearActive = () => {
    const { word, block } = activeRef.current;
    if (word >= 0) spansRef.current[word]?.classList.remove(WORD_ACTIVE_CLASS);
    if (block >= 0) taggedRef.current[block]?.el.classList.remove(BLOCK_ACTIVE_CLASS);
    activeRef.current = { word: -1, block: -1 };
  };

  const teardown = () => {
    cancelAnimationFrame(rafRef.current);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
    }
    clearActive();
    for (const t of taggedRef.current) {
      if (!t) continue;
      unwrapSpans(t.el, WORD_SPAN_CLASS);
      t.el.classList.remove(BLOCK_ACTIVE_CLASS);
    }
    taggedRef.current = [];
    spansRef.current = [];
    flatRef.current = [];
  };

  // Full teardown on slug change / unmount: no orphaned audio, DOM restored.
  useEffect(() => teardown, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the options popover on outside click / Escape.
  useEffect(() => {
    if (!optionsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [optionsOpen]);

  /**
   * Wrap every manifest word in a span inside its rendered block.
   * Runs once, lazily, on first play — the lesson body (Suspense) is
   * guaranteed mounted by then because the learner pressed play.
   */
  const ensureTagged = (): boolean => {
    if (taggedRef.current.some(Boolean)) return true;
    const flat = flattenWords(manifest);
    flatRef.current = flat;

    const domEls: Element[] = [];
    const domTexts: string[] = [];
    const titleEl = document.querySelector('[data-narrate="title"]');
    const summaryEl = document.querySelector('[data-narrate="summary"]');
    if (titleEl) {
      domEls.push(titleEl);
      domTexts.push(titleEl.textContent ?? '');
    }
    if (summaryEl) {
      domEls.push(summaryEl);
      domTexts.push(summaryEl.textContent ?? '');
    }
    const article = document.querySelector(articleSelector);
    if (article) {
      for (const b of extractLessonBlocks(article)) {
        domEls.push(b.element);
        domTexts.push(b.text);
      }
    }

    const alignment = alignBlocks(manifest.blocks, domTexts);
    // Flat-word offset of each block's first word.
    const flatStartOf: number[] = [];
    let cursor = 0;
    manifest.blocks.forEach((b) => {
      flatStartOf.push(cursor);
      cursor += b.words.length;
    });
    // Indexed by manifest block index (null when the block has no DOM
    // counterpart): tick() looks blocks up by FlatWord.block, which is the
    // manifest index, so a compacted array would misalign after any skip.
    const tagged: Array<TaggedBlock | null> = manifest.blocks.map((block, b) => {
      const domIdx = alignment[b];
      if (domIdx === null || block.words.length === 0) return null;
      const el = domEls[domIdx];
      const flatStart = flatStartOf[b];
      const wordTagged = wrapWordSpans(
        el,
        block.words.map((w) => w.text),
        (pos) => flatStart + pos,
      );
      return { el, flatStart, flatEnd: flatStart + block.words.length, wordTagged };
    });
    taggedRef.current = tagged;

    const spans: Array<HTMLSpanElement | null> = new Array(flat.length).fill(null);
    document
      .querySelectorAll<HTMLSpanElement>(`span.${WORD_SPAN_CLASS}[data-narr-idx]`)
      .forEach((span) => {
        const idx = Number(span.dataset.narrIdx);
        if (Number.isInteger(idx) && idx >= 0 && idx < spans.length) {
          spans[idx] = span;
        }
      });
    spansRef.current = spans;
    return tagged.some(Boolean);
  };

  const tick = () => {
    const audio = audioRef.current;
    if (!audio || statusRef.current !== 'playing') return;
    const t = audio.currentTime;
    const wi = findActiveWordIndex(flatRef.current, t);
    const prev = activeRef.current;
    if (wi !== prev.word) {
      if (prev.word >= 0) spansRef.current[prev.word]?.classList.remove(WORD_ACTIVE_CLASS);
      let block = prev.block;
      if (wi >= 0) {
        spansRef.current[wi]?.classList.add(WORD_ACTIVE_CLASS);
        block = flatRef.current[wi].block;
      }
      if (block !== prev.block) {
        if (prev.block >= 0) {
          taggedRef.current[prev.block]?.el.classList.remove(BLOCK_ACTIVE_CLASS);
        }
        if (block >= 0) {
          const tb = taggedRef.current[block];
          tb?.el.classList.add(BLOCK_ACTIVE_CLASS);
          // Keep the spoken block in view (gently — 'nearest' scrolls the
          // minimum needed). Skipped for reduced-motion users.
          if (!reducedMotionRef.current) {
            tb?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else {
            tb?.el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          }
        }
      }
      activeRef.current = { word: wi, block };
    }
    // Throttle progress state: the bar doesn't need 60fps.
    if (Math.abs(t - lastProgressRef.current) > 0.25) {
      lastProgressRef.current = t;
      setProgress(t);
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const ensureAudio = (): HTMLAudioElement | null => {
    if (typeof window === 'undefined') return null;
    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audio.preload = 'metadata';
      audio.playbackRate = speed;
      audio.onended = () => {
        cancelAnimationFrame(rafRef.current);
        setStatus('idle');
        clearActive();
        setProgress(0);
        lastProgressRef.current = -1;
      };
      audio.onerror = () => {
        // Corrupt/missing audio file: stop cleanly, learner keeps the text.
        cancelAnimationFrame(rafRef.current);
        setStatus('idle');
        clearActive();
      };
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const play = () => {
    const audio = ensureAudio();
    if (!audio) return;
    if (!ensureTagged()) return;
    audio.playbackRate = speed;
    setStatus('playing');
    void audio.play().catch(() => setStatus('idle'));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    audioRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
    setStatus('paused');
  };

  const toggle = () => {
    if (status === 'playing') pause();
    else play();
  };

  const seek = (value: number) => {
    const audio = ensureAudio();
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(value, 0), manifest.duration);
    lastProgressRef.current = -1;
    setProgress(audio.currentTime);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const mainLabel =
    status === 'playing' ? 'Pause narration' : status === 'paused' ? 'Resume narration' : 'Listen to this lesson';
  const statusText =
    status === 'playing'
      ? `Playing AI narration, ${fmtTime(progress)} of ${fmtTime(manifest.duration)}.`
      : status === 'paused'
        ? `Paused at ${fmtTime(progress)}.`
        : 'AI narration stopped.';

  return (
    <div ref={panelRef} className="relative inline-flex items-stretch">
      <div className="inline-flex overflow-hidden rounded-full">
        <button
          type="button"
          onClick={toggle}
          aria-label={mainLabel}
          aria-pressed={status === 'playing'}
          className={`${pillClass} rounded-r-none border-r-0 pr-3`}
        >
          <Icon name={status === 'playing' ? 'pause' : 'play'} className="h-4 w-4" />
          {status === 'playing' ? 'Listening…' : status === 'paused' ? 'Resume' : 'Listen'}
        </button>
        <button
          type="button"
          onClick={() => setOptionsOpen((o) => !o)}
          aria-expanded={optionsOpen}
          aria-label="Narration options"
          className={`${pillClass} rounded-l-none px-2.5`}
        >
          <Icon name="chevronDown" className="h-4 w-4" />
        </button>
      </div>

      {optionsOpen && (
        <div
          role="group"
          aria-label="Narration options"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-lift dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
              Progress
            </p>
            <p className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
              {fmtTime(progress)} / {fmtTime(manifest.duration)}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={manifest.duration}
            step={0.5}
            value={Math.min(progress, manifest.duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek narration"
            className="mt-2 w-full accent-accent-700 dark:accent-accent-400"
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Speed
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSpeed(s)}
                aria-pressed={speed === s}
                className={segmentClass(speed === s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
            Narrated by an AI voice — recorded when the course was built, so
            there&apos;s no account, no API key, and no cost. The audio downloads
            once as it plays, and the highlighting follows the words automatically.
          </p>
          <button
            type="button"
            onClick={onUseBrowserVoice}
            className="mt-2 text-xs font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-400"
          >
            Use my browser&apos;s voice instead
          </button>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}

/**
 * "Listen to this lesson" — neural narration when available, browser speech
 * synthesis otherwise.
 *
 * On mount it probes `public/audio/<slug>/narration.json`. When the
 * build-time narration exists, the learner gets the AI voice with
 * word-by-word read-along highlighting; when it doesn't (or the probe
 * fails), the proven Web Speech fallback renders instead — so listen mode
 * never breaks, even for lessons generated later.
 */
export function LessonNarrator({
  slug,
  articleSelector = '.lesson-prose',
}: {
  slug: string;
  articleSelector?: string;
}) {
  const [manifest, setManifest] = useState<NarrationManifest | null>(null);
  const [failed, setFailed] = useState(false);
  const [browserVoice, setBrowserVoice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(narrationJsonUrl(slug))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: unknown) => {
        if (!cancelled && isValidManifest(json)) setManifest(json);
        else if (!cancelled) setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed || browserVoice) {
    return <ListenButton slug={slug} articleSelector={articleSelector} />;
  }
  if (!manifest) {
    // Manifest still loading: the fallback works immediately, and is
    // replaced by the neural player the moment the manifest arrives.
    return <ListenButton slug={slug} articleSelector={articleSelector} />;
  }
  return (
    <NeuralPlayer
      slug={slug}
      manifest={manifest}
      articleSelector={articleSelector}
      onUseBrowserVoice={() => setBrowserVoice(true)}
    />
  );
}
