import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './ui/Icon';
import { ListenButton } from './ListenButton';
import { FloatingPlaybackButton } from './FloatingPlaybackButton';
import {
  PlayerChrome,
  pillClass,
  PopoverLabel,
  PopoverNote,
  SpeedSegments,
} from './player/PlayerChrome';
import { extractLessonBlocks } from '../lib/listen';
import {
  BEFORE_FIRST_BLOCK,
  buildNeuralSeekMap,
  canStep,
  hasResumePoint,
  resolveResumeBlock,
  allBlocks,
  snapToPlayable,
  stepBlock,
  type NeuralSeekPoint,
} from '../lib/listen-seek';
import { createPlaybackShare, type PlaybackShare } from '../lib/playback-share';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { positionFor, useListenPositionStore } from '../store/listenPosition';
import { ReadFromHere } from './ReadFromHere';
import { useSeekShortcuts } from './player/useSeekShortcuts';
import {
  alignBlocks,
  findActiveWordIndex,
  flattenWords,
  loadAccentPreference,
  NARRATION_ACCENTS,
  narrationAudioUrl,
  saveAccentPreference,
  type FlatWord,
  type NarrationAccent,
  type NarrationManifest,
} from '../lib/narration';
import { useNarrationProbe } from './useNarrationProbe';
import {
  BLOCK_ACTIVE_CLASS,
  WORD_ACTIVE_CLASS,
  WORD_SPAN_CLASS,
  scrollBlockIntoView,
  unwrapSpans,
  wrapWordSpans,
} from '../lib/narrate-dom';

type Status = 'idle' | 'playing' | 'paused';

/**
 * Below this fraction of manifest blocks aligned to the rendered lesson,
 * the narration is treated as stale (prose edited after recording) and the
 * learner is told so, with a one-tap switch to the browser voice.
 */
const STALE_ALIGNMENT_RATIO = 0.7;

const fmtTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
  accent,
  manifest,
  articleSelector,
  onUseBrowserVoice,
  share,
  startPlaying = false,
  startBlock = null,
}: {
  slug: string;
  /** Accent whose manifest/audio this player instance is bound to. */
  accent: NarrationAccent;
  manifest: NarrationManifest;
  articleSelector: string;
  onUseBrowserVoice: () => void;
  /**
   * Shared playback state (see `src/lib/playback-share.ts`): status
   * changes are published so the floating pause/play button agrees with
   * this player, and the floating button's toggle drives this player.
   */
  share: PlaybackShare;
  /**
   * Auto-start playback on mount. Set when the manifest arrived lazily
   * from a Listen press, so one press both fetches and plays. If the
   * browser blocks it (the async fetch left the user-gesture window),
   * play()'s own catch leaves the pill idle and a second press plays.
   */
  startPlaying?: boolean;
  /**
   * Block index (see `lib/listen-seek.ts`) the auto-start should begin at —
   * set when the learner pressed "read from here" / "continue" before the
   * manifest had loaded. `null` plays from the start.
   */
  startBlock?: number | null;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [speed, setSpeed] = useState<number>(1);
  const [progress, setProgress] = useState(0);
  // Seek state. `points` are the blocks that aligned to the recording (set
  // on first play); `currentBlock` is the block being narrated (-1 while the
  // title/summary play). The ref mirrors the state so rapid presses between
  // renders step from where the last press landed.
  const [points, setPoints] = useState<NeuralSeekPoint[]>([]);
  const [currentBlock, setCurrentBlock] = useState(BEFORE_FIRST_BLOCK);
  const currentBlockRef = useRef(BEFORE_FIRST_BLOCK);
  const [seekNote, setSeekNote] = useState('');
  /**
   * One-line, non-blocking notices: untagged playback, stale narration,
   * audio load failure. `offerFallback` adds the "use my browser's voice
   * instead" link.
   */
  const [notice, setNotice] = useState<{
    text: string;
    offerFallback: boolean;
  } | null>(null);

  /**
   * Cached staleness verdict from the last full tagging pass (null = not
   * yet evaluated). ensureTagged() short-circuits on repeat plays, but
   * play() clears the notice on every fresh attempt — without the cache,
   * pause→resume would silently drop a stale-alignment notice whose
   * condition still holds.
   */
  const staleRef = useRef<boolean | null>(null);

  /** Notice shown when the lesson prose changed after recording. */
  const STALE_NOTICE = {
    text: 'This lesson\u2019s text has changed since its narration was recorded, so the highlighting may not match the words you hear.',
    offerFallback: true,
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flatRef = useRef<FlatWord[]>([]);
  const taggedRef = useRef<Array<TaggedBlock | null>>([]);
  const spansRef = useRef<Array<HTMLSpanElement | null>>([]);
  const activeRef = useRef<{ word: number; block: number }>({ word: -1, block: -1 });
  const rafRef = useRef(0);
  const lastProgressRef = useRef(-1);
  const statusRef = useRef<Status>(status);
  const reducedMotionRef = useRef(false);
  /** Manifest block -> canonical block index (see `buildNeuralSeekMap`). */
  const canonicalOfRef = useRef<Array<number | null>>([]);
  const pointsRef = useRef<NeuralSeekPoint[]>([]);
  /** A seek requested before the audio's metadata loaded (see setAudioTime). */
  const pendingTimeRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const audioUrl = useMemo(
    () => narrationAudioUrl(slug, accent, manifest),
    [slug, accent, manifest],
  );

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  // NOTE: the effect above is only a backstop. The karaoke rAF loop gates
  // on statusRef, and rAF callbacks can run before React flushes a state
  // update (rAF-vs-Macrotask ordering is not deterministic) — so the
  // handlers below write statusRef synchronously. Without that, the first
  // tick could see a stale 'idle' and the highlight loop would die silently.

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

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
    staleRef.current = null;
    canonicalOfRef.current = [];
    pointsRef.current = [];
    pendingTimeRef.current = null;
  };

  // Full teardown on slug change / unmount: no orphaned audio, DOM restored.
  useEffect(() => teardown, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Wrap every manifest word in a span inside its rendered block.
   * Runs once, lazily, on first play — the lesson body (Suspense) is
   * guaranteed mounted by then because the learner pressed play.
   *
   * Returns `true` when at least one block aligned. A `false` return means
   * the prose changed so much that nothing matches — the caller still
   * plays the audio (timestamps stay valid for the seek bar) and shows a
   * notice instead of leaving a dead button.
   */
  const ensureTagged = (): boolean => {
    if (taggedRef.current.some(Boolean)) {
      // Repeat play (e.g. pause→resume): tagging persists, so the cached
      // staleness verdict is re-applied — play() clears the notice on every
      // fresh attempt, and without this the stale notice would vanish even
      // though the prose is still stale.
      if (staleRef.current) setNotice(STALE_NOTICE);
      return true;
    };
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
    // Canonical block indices for seeking: DOM positions minus the leading
    // title/summary entries, so they match the speech engine's indices.
    const seekMap = buildNeuralSeekMap(
      manifest.blocks,
      alignment,
      (titleEl ? 1 : 0) + (summaryEl ? 1 : 0),
    );
    canonicalOfRef.current = seekMap.canonicalOf;
    pointsRef.current = seekMap.points;
    setPoints(seekMap.points);
    // Flat-word offset of each block's first word, derived from the same
    // flattened array the highlighter binary-searches — one computation,
    // no chance of the two drifting apart.
    const flatStartOf = new Map<number, number>();
    flat.forEach((w, i) => {
      if (!flatStartOf.has(w.block)) flatStartOf.set(w.block, i);
    });
    // Indexed by manifest block index (null when the block has no DOM
    // counterpart): tick() looks blocks up by FlatWord.block, which is the
    // manifest index, so a compacted array would misalign after any skip.
    const tagged: Array<TaggedBlock | null> = manifest.blocks.map((block, b) => {
      const domIdx = alignment[b];
      if (domIdx === null || block.words.length === 0) return null;
      const el = domEls[domIdx];
      const flatStart = flatStartOf.get(b) ?? 0;
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

    const alignedCount = tagged.filter(Boolean).length;
    if (alignedCount === 0) return false;
    // Staleness signal: the lesson prose was edited after the narration
    // was recorded. The audio still plays; the learner gets an honest note
    // and a one-tap switch to the browser voice. Cached so repeat plays
    // (which short-circuit above) keep the notice.
    const stale = alignedCount < manifest.blocks.length * STALE_ALIGNMENT_RATIO;
    staleRef.current = stale;
    if (stale) {
      setNotice(STALE_NOTICE);
    }
    return true;
  };

  /**
   * Move the karaoke highlight to media time `t`. Shared by the rAF loop and
   * by seeks while paused (where no loop runs). `block` is the manifest block
   * to show when no word is active at `t`; `forceScroll` re-centers the
   * block even if it was already the active one (the learner may have
   * scrolled away before jumping).
   */
  const syncHighlight = (t: number, opts: { block?: number; forceScroll?: boolean } = {}) => {
    const wi = findActiveWordIndex(flatRef.current, t);
    const prev = activeRef.current;
    let block = prev.block;
    if (wi >= 0) block = flatRef.current[wi].block;
    else if (opts.block !== undefined) block = opts.block;
    if (wi !== prev.word || block !== prev.block) {
      if (prev.word >= 0 && prev.word !== wi) {
        spansRef.current[prev.word]?.classList.remove(WORD_ACTIVE_CLASS);
      }
      if (wi >= 0) spansRef.current[wi]?.classList.add(WORD_ACTIVE_CLASS);
      if (block !== prev.block) {
        if (prev.block >= 0) {
          taggedRef.current[prev.block]?.el.classList.remove(BLOCK_ACTIVE_CLASS);
        }
        if (block >= 0) {
          const tb = taggedRef.current[block];
          tb?.el.classList.add(BLOCK_ACTIVE_CLASS);
          // Keep the spoken block in view (gently — 'nearest' scrolls the
          // minimum needed). Skipped for reduced-motion users.
          if (tb && !opts.forceScroll) {
            tb.el.scrollIntoView({
              block: 'nearest',
              behavior: reducedMotionRef.current ? 'auto' : 'smooth',
            });
          }
          const canonical = canonicalOfRef.current[block];
          if (canonical !== undefined && canonical !== null) {
            currentBlockRef.current = canonical;
            setCurrentBlock(canonical);
            // The title/summary count as "the start" (block 0): starting
            // over forgets the old resume point.
            useListenPositionStore.getState().setPosition(slug, Math.max(0, canonical));
          }
        }
      }
      activeRef.current = { word: wi, block };
    }
    if (opts.forceScroll && block >= 0) {
      const tb = taggedRef.current[block];
      if (tb) scrollBlockIntoView(tb.el, reducedMotionRef.current);
    }
  };

  const tick = () => {
    const audio = audioRef.current;
    if (!audio || statusRef.current !== 'playing') return;
    const t = audio.currentTime;
    syncHighlight(t);
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
        statusRef.current = 'idle';
        setStatus('idle');
        clearActive();
        setProgress(0);
        lastProgressRef.current = -1;
        // Finished the lesson: nothing left to continue from.
        useListenPositionStore.getState().clearPosition(slug);
        currentBlockRef.current = BEFORE_FIRST_BLOCK;
        setCurrentBlock(BEFORE_FIRST_BLOCK);
        setSeekNote('');
      };
      audio.onerror = () => {
        // Corrupt/missing audio file (the probe only fetched the JSON, so
        // this is reachable): drop the broken element so a retry builds a
        // fresh one, and offer the browser voice instead of a dead button.
        cancelAnimationFrame(rafRef.current);
        statusRef.current = 'idle';
        setStatus('idle');
        clearActive();
        audioRef.current = null;
        setNotice({
          text: "Couldn't load the AI narration audio.",
          offerFallback: true,
        });
      };
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const play = (fromBlock?: number) => {
    const audio = ensureAudio();
    if (!audio) return;
    // Fresh attempt: drop any previous notice (e.g. a load error from an
    // earlier try). ensureTagged()/the failure path below re-set it when
    // the condition still holds.
    setNotice(null);
    const tagged = ensureTagged();
    if (!tagged) {
      // Nothing aligned (prose rewritten after recording): still play the
      // audio — timestamps stay valid for the seek bar — and say so plainly
      // instead of leaving a pressed button that does nothing.
      setNotice({
        text: 'Word-by-word highlighting isn\u2019t available for this lesson, but the audio still plays.',
        offerFallback: false,
      });
    }
    audio.playbackRate = speed;
    setSeekNote('');
    // Position the audio before play() so it never blips from the start.
    if (fromBlock !== undefined && tagged) jumpTo(fromBlock, false);
    // Synchronous ref write: the rAF loop gates on statusRef and can run
    // before React flushes setStatus (see the note on the sync effect).
    statusRef.current = 'playing';
    setStatus('playing');
    void audio.play().catch(() => {
      statusRef.current = 'idle';
      setStatus('idle');
    });
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    audioRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
    statusRef.current = 'paused';
    setStatus('paused');
  };

  const toggle = () => {
    setSeekNote('');
    if (status === 'playing') pause();
    else play();
  };

  /**
   * Set `audio.currentTime`. A seek before the file's metadata has loaded
   * (first press, nothing buffered yet) is ignored by some browsers, so it
   * is remembered and re-applied on `loadedmetadata`.
   */
  const setAudioTime = (audio: HTMLAudioElement, t: number) => {
    pendingTimeRef.current = null;
    audio.currentTime = t;
    // readyState 0 = HAVE_NOTHING: no metadata yet.
    if (audio.readyState < 1) {
      pendingTimeRef.current = t;
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (pendingTimeRef.current === null) return;
          audio.currentTime = pendingTimeRef.current;
          pendingTimeRef.current = null;
        },
        { once: true },
      );
    }
  };

  /**
   * Move the narration to the start of `block` (snapped to a block that
   * aligned to the recording). Works playing or paused: the audio position
   * and highlight update immediately; whether it then plays is up to the
   * current status. `announce` adds the "Paragraph n of m" live-region note.
   */
  const jumpTo = (block: number, announce = true) => {
    const audio = ensureAudio();
    if (!audio) return;
    const pts = pointsRef.current;
    const blocks = pts.map((p) => p.block);
    const target = snapToPlayable(blocks, block);
    const point = pts.find((p) => p.block === target);
    if (!point) return;
    setAudioTime(audio, point.time);
    lastProgressRef.current = -1;
    setProgress(point.time);
    clearActive();
    currentBlockRef.current = point.block;
    setCurrentBlock(point.block);
    useListenPositionStore.getState().setPosition(slug, point.block);
    syncHighlight(point.time, {
      block: canonicalOfRef.current.indexOf(point.block),
      forceScroll: true,
    });
    if (announce) setSeekNote(`Paragraph ${blocks.indexOf(point.block) + 1} of ${blocks.length}.`);
  };

  /** Jump to a block; an idle player starts playing from it. */
  const seekToBlock = (block: number) => {
    if (statusRef.current === 'idle') play(block);
    else jumpTo(block);
  };

  const step = (delta: -1 | 1) => {
    const next = stepBlock(
      pointsRef.current.map((p) => p.block),
      currentBlockRef.current,
      delta,
    );
    if (next !== null) seekToBlock(next);
  };

  // Seek: expose handlers to the floating button / read-from-here / resume,
  // publish which directions are possible, and wire ←/→ while active.
  const active = status !== 'idle';
  const playable = points.map((p) => p.block);
  const canPrev = active && canStep(playable, currentBlock, -1);
  const canNext = active && canStep(playable, currentBlock, 1);
  useEffect(() => {
    share.registerSeek({ toBlock: seekToBlock, step });
    return () => share.registerSeek(null);
  });
  useEffect(() => {
    share.setSeek({ canPrev, canNext });
  }, [canPrev, canNext, share]);
  useEffect(() => () => share.setSeek({ canPrev: false, canNext: false }), [share]);
  useSeekShortcuts(active, step);

  // Shared playback state: publish status for the floating button and let
  // it drive this player's toggle. Registered without a dep array so the
  // floating button always calls the latest toggle closure.
  useEffect(() => {
    share.setStatus(status);
  }, [status, share]);
  useEffect(() => {
    share.registerToggle(toggle);
    return () => share.registerToggle(null);
  });

  // Lazily-probed manifests (startPlaying) arrive after the learner
  // pressed Listen: begin playback immediately so one press both fetches
  // and plays. Guarded so a re-render never restarts a paused lesson.
  const didAutoPlayRef = useRef(false);
  useEffect(() => {
    if (startPlaying && !didAutoPlayRef.current) {
      didAutoPlayRef.current = true;
      play(startBlock ?? undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (value: number) => {
    const audio = ensureAudio();
    if (!audio) return;
    pendingTimeRef.current = null;
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
    seekNote ||
    (status === 'playing'
      ? `Playing AI narration, ${fmtTime(progress)} of ${fmtTime(manifest.duration)}.`
      : status === 'paused'
        ? `Paused at ${fmtTime(progress)}.`
        : 'AI narration stopped.');

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <PlayerChrome
        playLabel={mainLabel}
        playText={status === 'playing' ? 'Listening…' : status === 'paused' ? 'Resume' : 'Listen'}
        playing={status === 'playing'}
        onToggle={toggle}
        optionsLabel="Narration options"
        popoverLabel="Narration options"
        popoverWidthClass="w-72"
        statusText={statusText}
        seek={
          active && points.length > 1
            ? {
                onPrev: () => step(-1),
                onNext: () => step(1),
                canPrev,
                canNext,
              }
            : undefined
        }
      >
        <div className="flex items-baseline justify-between">
          <PopoverLabel>Progress</PopoverLabel>
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
        <div className="mt-3">
          <SpeedSegments speed={speed} onSelect={changeSpeed} />
        </div>
        <PopoverNote>
          Narrated by an AI voice (
          {accent === 'uk' ? 'UK English' : 'US English'}) — recorded when
          the course was built, so there&apos;s no account, no API key, and
          no cost. The audio downloads once as it plays, and the
          highlighting follows the words automatically.
        </PopoverNote>
        <button
          type="button"
          onClick={onUseBrowserVoice}
          className="mt-2 text-xs font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-400"
        >
          Use my browser&apos;s voice instead
        </button>
      </PlayerChrome>

      {notice && (
        <p
          role="status"
          className="max-w-72 text-xs leading-relaxed text-stone-500 dark:text-stone-400"
        >
          {notice.text}{' '}
          {notice.offerFallback && (
            <button
              type="button"
              onClick={() => {
                // The learner took the fallback: the notice's complaint no
                // longer applies, so dismiss it instead of leaving stale text
                // under the browser-voice player.
                setNotice(null);
                onUseBrowserVoice();
              }}
              className="font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-400"
            >
              Use my browser&apos;s voice instead
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * "Listen to this lesson" — neural narration when available, browser speech
 * synthesis otherwise.
 *
 * The manifest (`public/audio/<slug>/<accent>/narration.json`) is fetched
 * lazily: a build-time index (`src/lib/narration-index.ts`) is consulted
 * synchronously on mount, and the manifest is requested only on the first
 * Listen press (hover/focus prefetches). Lessons and accents with no
 * narration never probe the network at all — when the index says no (or
 * the fetch fails), the proven Web Speech fallback renders instead, so
 * listen mode never breaks, even for lessons generated later or accents
 * not yet recorded.
 */
export function LessonNarrator({
  slug,
  articleSelector = '.lesson-prose',
}: {
  slug: string;
  articleSelector?: string;
}) {
  const [accent, setAccent] = useState<NarrationAccent>(loadAccentPreference);
  const [browserVoice, setBrowserVoice] = useState(false);
  // Block the lazily-loaded narration should start at (set when "read from
  // here" or "continue" is pressed before any player is mounted).
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  // Lazy manifest probe: no network on mount; the first Listen press
  // fetches (hover/focus prefetches) and plays.
  const probe = useNarrationProbe(slug, accent);

  // One shared playback state per lesson mount: the active player (neural
  // or the Web Speech fallback) publishes its status here, and the
  // floating pause/play button drives playback through it — both controls
  // always agree. See `src/lib/playback-share.ts`.
  const [share] = useState(() => createPlaybackShare());

  // Drop any stale shared status on slug/accent change so the floating
  // button can never show "playing" for a dead player. (The probe hook
  // resets its own state on the same change.)
  useEffect(() => {
    share.setStatus('idle');
  }, [slug, accent, share]);

  const changeAccent = (next: NarrationAccent) => {
    if (next === accent) return;
    saveAccentPreference(next);
    setAccent(next);
    // Fresh accent: the probe hook resets to idle (the next Listen press
    // re-probes the new accent), and any fallback state is cleared so the
    // neural player gets its chance first.
    setBrowserVoice(false);
    setPendingStart(null);
    share.setStatus('idle');
  };

  const status = useSyncExternalStore(
    share.subscribe,
    share.getStatus,
    () => 'idle' as const,
  );
  const saved = useListenPositionStore((s) => positionFor(s.positions, slug));

  // The floating button appears only when narration is available: the
  // neural player is up, or the Web Speech fallback can render — the same
  // support gating as the main player.
  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const neuralReady =
    probe.state === 'ready' && probe.manifest !== null && !browserVoice;
  const floatingVisible = neuralReady || (!neuralReady && speechSupported);

  /**
   * Start Listen at `block` on whichever engine is active. When no player
   * is mounted yet (the manifest is still unfetched, so only the inert
   * Listen pill exists) remember the block and fetch-and-play: the neural
   * player consumes it on mount.
   */
  const startAtBlock = (block: number) => {
    if (share.seekToBlock(block)) return;
    setPendingStart(block);
    probe.probe({ autoplay: true });
  };

  const continueListening = () => {
    const root = document.querySelector(articleSelector);
    const count = root ? extractLessonBlocks(root).length : 0;
    // Clamp into today's lesson (it may have shrunk since the position was
    // saved); the engine then snaps to a block it can actually start at.
    startAtBlock(resolveResumeBlock(saved, allBlocks(count)) ?? 0);
  };
  const showResume = status === 'idle' && floatingVisible && hasResumePoint(saved);

  // Branch order is a race-safety invariant (P0-5): the Web Speech fallback
  // mounts only in terminal states for this slug+accent — the build-time
  // index said no narration, the probe already failed, or the learner
  // explicitly chose the browser voice. While the manifest is merely
  // unresolved the inert pill renders instead, so a *playing* ListenButton
  // can never be unmounted by a NeuralPlayer mount (the unmount cleanup
  // calls speechSynthesis.cancel(), which would kill speech mid-sentence).
  const player =
    browserVoice || !probe.narratable || probe.state === 'failed' ? (
      // No build-time narration for this lesson/accent (the index said no,
      // so nothing was ever probed), the probe failed, or the learner chose
      // the browser voice: the Web Speech fallback.
      <ListenButton
        key={`${slug}:${accent}`}
        slug={slug}
        articleSelector={articleSelector}
        share={share}
      />
    ) : probe.state === 'ready' && probe.manifest ? (
      <NeuralPlayer
        key={`${slug}:${accent}`}
        slug={slug}
        accent={accent}
        manifest={probe.manifest}
        articleSelector={articleSelector}
        onUseBrowserVoice={() => {
          setPendingStart(null);
          setBrowserVoice(true);
        }}
        share={share}
        startPlaying={probe.autoplay}
        startBlock={pendingStart}
      />
    ) : (
      // Manifest not fetched yet: a Listen pill that fetches on press and
      // plays when the manifest lands; hover/focus prefetches silently.
      <button
        type="button"
        onClick={() => probe.probe({ autoplay: true })}
        onMouseEnter={() => probe.probe()}
        onFocus={() => probe.probe()}
        aria-label="Listen to this lesson"
        aria-busy={probe.state === 'loading'}
        className={pillClass}
      >
        <Icon
          name="play"
          className={`h-4 w-4 ${probe.state === 'loading' ? 'animate-pulse' : ''}`}
        />
        {probe.state === 'loading' ? 'Loading…' : 'Listen'}
      </button>
    );

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <div className="inline-flex items-center gap-1.5">
        {player}
        <div
          role="group"
          aria-label="Narration voice: US or UK English"
          className="inline-flex overflow-hidden rounded-full border border-stone-200/80 bg-white shadow-soft dark:border-stone-700 dark:bg-stone-900"
        >
          {NARRATION_ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => changeAccent(a)}
              aria-pressed={accent === a}
              aria-label={`${a === 'us' ? 'US' : 'UK'} English narration`}
              title={`${a === 'us' ? 'US' : 'UK'} English narration`}
              className={`px-2.5 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                accent === a
                  ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-stone-950'
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
              }`}
            >
              {a === 'us' ? 'US' : 'UK'}
            </button>
          ))}
        </div>
        <FloatingPlaybackButton share={share} visible={floatingVisible} />
      </div>
      {showResume && (
        <button
          type="button"
          onClick={continueListening}
          className="text-xs font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-400"
        >
          Continue from where you left off
        </button>
      )}
      <ReadFromHere
        articleSelector={articleSelector}
        enabled={floatingVisible}
        onSelect={startAtBlock}
      />
    </div>
  );
}
