import { useEffect, useRef, useState } from 'react';
import {
  chunkBlocks,
  extractLessonBlocks,
  splitSentences,
  type BlockChunk,
  type LessonBlock,
  type VoicePreference,
} from '../lib/listen';
import { runChunk, type ChunkRun } from '../lib/listen-speak';
import type { PlaybackShare } from '../lib/playback-share';
import {
  PlayerChrome,
  PopoverLabel,
  PopoverNote,
  segmentClass,
  SpeedSegments,
} from './player/PlayerChrome';
import {
  BLOCK_ACTIVE_CLASS,
  SENT_ACTIVE_CLASS,
  SENT_SPAN_CLASS,
  unwrapSpans,
  wrapSentenceSpans,
} from '../lib/narrate-dom';

type Status = 'idle' | 'playing' | 'paused';

/**
 * If an utterance hasn't fired `onstart` after this long, the platform
 * dropped it silently (no onstart/onend/onerror) — recover instead of
 * stranding the UI at "Listening…". 5s is generous enough for slow network
 * voices to start, short enough that a stuck button recovers quickly.
 */
const START_WATCHDOG_MS = 5000;

const VOICE_OPTIONS: { value: VoicePreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'us', label: 'US' },
  { value: 'uk', label: 'UK' },
];

/**
 * "Listen to this lesson" — browser speech-synthesis fallback.
 *
 * This is the fallback voice behind `LessonNarrator`: it renders when no
 * build-time neural narration exists for the lesson (or the learner picks
 * "browser voice"). No network, no keys, no backend, no audio files: the
 * learner's own device does the speaking, so this also works offline where
 * the platform ships offline voices.
 *
 * While reading, the block being spoken is highlighted, and — on browsers
 * that fire speech boundary events — the exact sentence is highlighted too,
 * so the learner can follow along in the text.
 *
 * Nothing autoplays, the text stays primary, and the control is one quiet
 * pill in the lesson header. The pill chrome (play button, options chevron,
 * dismissible popover) is the shared `PlayerChrome`; this component only
 * owns the speech-synthesis engine behind it.
 */
export function ListenButton({
  slug,
  articleSelector = '.lesson-prose',
  share,
}: {
  /** Current lesson slug — speech is cancelled when it changes. */
  slug: string;
  /** CSS selector for the element holding the lesson's rendered prose. */
  articleSelector?: string;
  /**
   * Optional shared playback state (see `src/lib/playback-share.ts`).
   * When provided, status changes are published so the floating pause/play
   * button agrees with this player, and the floating button's toggle
   * drives this player's own toggle.
   */
  share?: PlaybackShare;
}) {
  // SSR-safe: prerender.mjs runs this component in Node, where `window`
  // doesn't exist. Unsupported browsers get no button at all.
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const [status, setStatus] = useState<Status>('idle');
  const [speed, setSpeed] = useState<number>(1);
  const [voicePref, setVoicePref] = useState<VoicePreference>('auto');

  const statusRef = useRef<Status>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const chunksRef = useRef<BlockChunk[]>([]);
  const blocksRef = useRef<LessonBlock[]>([]);
  const indexRef = useRef(0);
  const activeBlockRef = useRef<Element | null>(null);
  const activeSentRef = useRef<Element | null>(null);
  const runRef = useRef<ChunkRun | null>(null);
  // Whether the current run's utterance had fired `onstart` at the moment
  // the user paused — decides the resume path (see toggle()).
  const pausedAfterStartRef = useRef(false);

  const clearHighlight = () => {
    activeBlockRef.current?.classList.remove(BLOCK_ACTIVE_CLASS);
    activeBlockRef.current = null;
    activeSentRef.current?.classList.remove(SENT_ACTIVE_CLASS);
    activeSentRef.current = null;
  };

  const stop = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    runRef.current?.dispose();
    runRef.current = null;
    // Settle state first so any stray `onend` from the cancelled utterance
    // is ignored by the guard in `speakNext`.
    setStatus('idle');
    indexRef.current = 0;
    clearHighlight();
    const root = document.querySelector(articleSelector);
    if (root) unwrapSpans(root, SENT_SPAN_CLASS);
    window.speechSynthesis.cancel();
  };

  // No orphaned audio: navigating to another lesson (or unmounting) stops
  // playback and restores the article DOM. The cleanup runs on slug change
  // as well as unmount.
  useEffect(() => {
    return () => {
      runRef.current?.dispose();
      runRef.current = null;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      clearHighlight();
      const root = document.querySelector(articleSelector);
      if (root) unwrapSpans(root, SENT_SPAN_CLASS);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, articleSelector]);

  /** Highlight the sentence containing `charIndex` inside the chunk. */
  const highlightSentence = (chunk: BlockChunk, charIndex: number) => {
    const block = blocksRef.current[chunk.blockIndex];
    if (!block) return;
    const sentences = splitSentences(chunk.text);
    let cursor = 0;
    let local = sentences.length - 1;
    for (let i = 0; i < sentences.length; i++) {
      const end = cursor + sentences[i].length;
      if (charIndex <= end) {
        local = i;
        break;
      }
      cursor = end + 1; // the joining space
    }
    const globalIdx = chunk.sentenceStart + local;
    const span = block.element.querySelector(
      `span.${SENT_SPAN_CLASS}[data-narr-sent="${globalIdx}"]`,
    );
    if (span && span !== activeSentRef.current) {
      activeSentRef.current?.classList.remove(SENT_ACTIVE_CLASS);
      span.classList.add(SENT_ACTIVE_CLASS);
      activeSentRef.current = span;
    }
  };

  const speakNext = (index: number) => {
    const synth = window.speechSynthesis;
    const chunks = chunksRef.current;
    if (index >= chunks.length) {
      setStatus('idle');
      indexRef.current = 0;
      clearHighlight();
      const root = document.querySelector(articleSelector);
      if (root) unwrapSpans(root, SENT_SPAN_CLASS);
      return;
    }
    const chunk = chunks[index];
    // Voice resolution + the silent-drop watchdog live in lib/listen-speak so
    // they can be unit-tested with a mocked speechSynthesis (no DOM needed).
    // The highlight hooks ride on the same utterance: block-level highlight
    // always fires on start; sentence-level follows speech boundaries where
    // the browser reports them (Chrome/Edge do; some browsers don't).
    runRef.current?.dispose();
    runRef.current = runChunk({
      synth,
      createUtterance: (text) => new SpeechSynthesisUtterance(text),
      text: chunk.text,
      rate: speed,
      preference: voicePref,
      startWatchdogMs: START_WATCHDOG_MS,
      onStart: () => {
        clearHighlight();
        const block = blocksRef.current[chunk.blockIndex];
        if (block) {
          block.element.classList.add(BLOCK_ACTIVE_CLASS);
          activeBlockRef.current = block.element;
        }
      },
      onBoundary: (charIndex) => {
        if (statusRef.current !== 'playing') return;
        highlightSentence(chunk, charIndex);
      },
      onEnd: () => {
        if (statusRef.current !== 'playing') return;
        indexRef.current += 1;
        speakNext(indexRef.current);
      },
      onError: () => {
        // e.g. the voice list changed mid-lesson — stop cleanly, don't loop.
        if (statusRef.current === 'playing') stop();
      },
      onUnrecoverable: () => {
        // Preferred voice AND default voice both dropped silently — stop
        // cleanly so the button never strands at "Listening…".
        if (statusRef.current === 'playing') stop();
      },
    });
  };

  const play = () => {
    const synth = window.speechSynthesis;
    // Clear any stuck state first (long-standing Chrome quirk).
    synth.cancel();
    const root = document.querySelector(articleSelector);
    const blocks = root ? extractLessonBlocks(root) : [];
    const chunks = chunkBlocks(blocks);
    if (chunks.length === 0) return;
    // Tag every block's sentences so the spoken sentence can light up.
    // Blocks that fail tagging keep block-level highlighting only.
    blocks.forEach((block) => {
      wrapSentenceSpans(block.element, splitSentences(block.text));
    });
    blocksRef.current = blocks;
    chunksRef.current = chunks;
    indexRef.current = 0;
    setStatus('playing');
    speakNext(0);
  };

  const toggle = () => {
    if (!supported) return;
    if (status === 'playing') {
      // Capture whether the utterance ever started BEFORE touching the run:
      // pausing inside the start-watchdog window means the run is dead (its
      // watchdog must not fire into a paused synth), while pausing mid-chunk
      // leaves a live queued utterance that resume() can play.
      const started = runRef.current?.hasStarted() ?? false;
      pausedAfterStartRef.current = started;
      if (!started) {
        runRef.current?.dispose();
        runRef.current = null;
      }
      window.speechSynthesis.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      if (pausedAfterStartRef.current) {
        // Mid-chunk pause: the utterance is still queued — resume plays it.
        window.speechSynthesis.resume();
      } else {
        // Paused before anything started (e.g. during the watchdog window):
        // the old run is disposed, so speak a fresh utterance + watchdog for
        // the current chunk. Still inside the click gesture, so voice
        // resolution stays synchronous.
        window.speechSynthesis.cancel();
        speakNext(indexRef.current);
      }
      setStatus('playing');
    } else {
      play();
    }
  };

  // Shared playback state: publish status for the floating button and let
  // it drive this player's toggle. Registered without a dep array so the
  // floating button always calls the latest toggle closure.
  useEffect(() => {
    share?.setStatus(status);
  }, [status, share]);
  useEffect(() => {
    if (!share) return;
    share.registerToggle(toggle);
    return () => share.registerToggle(null);
  });

  if (!supported) return null;

  const mainLabel =
    status === 'playing' ? 'Pause listening' : status === 'paused' ? 'Resume listening' : 'Listen to this lesson';
  const statusText =
    status === 'playing'
      ? 'Playing lesson audio.'
      : status === 'paused'
        ? 'Paused.'
        : 'Lesson audio stopped.';

  return (
    <PlayerChrome
      playLabel={mainLabel}
      playText={status === 'playing' ? 'Listening…' : status === 'paused' ? 'Resume' : 'Listen'}
      playing={status === 'playing'}
      onToggle={toggle}
      optionsLabel="Listening options: speed and voice"
      popoverLabel="Listening options"
      statusText={statusText}
    >
      <SpeedSegments speed={speed} onSelect={setSpeed} />
      <div className="mt-3">
        <PopoverLabel>Browser voice</PopoverLabel>
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Browser voice preference">
          {VOICE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setVoicePref(o.value)}
              aria-pressed={voicePref === o.value}
              className={segmentClass(voicePref === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <PopoverNote>
        Read aloud by your browser — voice quality varies by device. Speed
        and voice apply the next time you press play.
      </PopoverNote>
    </PlayerChrome>
  );
}
