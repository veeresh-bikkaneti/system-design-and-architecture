import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import {
  extractLessonText,
  rankVoices,
  type VoicePreference,
} from '../lib/listen';

type Status = 'idle' | 'playing' | 'paused';

const SPEEDS = [0.9, 1, 1.25, 1.5] as const;

const VOICE_OPTIONS: { value: VoicePreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'us', label: 'US' },
  { value: 'uk', label: 'UK' },
];

/** Same pill recipe as ShareButtons — this is a secondary header action. */
const pillClass =
  'inline-flex items-center gap-1.5 border border-stone-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-800 dark:hover:text-accent-300';

const segmentClass = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-stone-950'
      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
  }`;

/**
 * "Listen to this lesson" — strictly opt-in audio via the browser's own
 * speech synthesis. No network, no keys, no backend, no audio files: the
 * learner's device does the speaking, so this also works offline where the
 * platform ships offline voices.
 *
 * AI narration here is an *alternative*, never the featured experience:
 * nothing autoplays, the text stays primary, and the control is one quiet
 * pill in the lesson header.
 */
export function ListenButton({
  slug,
  articleSelector = '.lesson-prose',
}: {
  /** Current lesson slug — speech is cancelled when it changes. */
  slug: string;
  /** CSS selector for the element holding the lesson's rendered prose. */
  articleSelector?: string;
}) {
  // SSR-safe: prerender.mjs runs this component in Node, where `window`
  // doesn't exist. Unsupported browsers get no button at all.
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const [status, setStatus] = useState<Status>('idle');
  const [speed, setSpeed] = useState<number>(1);
  const [voicePref, setVoicePref] = useState<VoicePreference>('auto');
  const [optionsOpen, setOptionsOpen] = useState(false);

  const statusRef = useRef<Status>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const stop = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // Settle state first so any stray `onend` from the cancelled utterance
    // is ignored by the guard in `speakNext`.
    setStatus('idle');
    indexRef.current = 0;
    window.speechSynthesis.cancel();
  };

  // No orphaned audio: navigating to another lesson (or unmounting) stops
  // playback. The cleanup runs on slug change as well as unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [slug]);

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

  const speakNext = (index: number) => {
    const synth = window.speechSynthesis;
    const chunks = chunksRef.current;
    if (index >= chunks.length) {
      setStatus('idle');
      indexRef.current = 0;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.rate = speed;
    const ranked = rankVoices(synth.getVoices(), voicePref);
    if (ranked) utterance.voice = ranked;
    utterance.onend = () => {
      if (statusRef.current !== 'playing') return;
      indexRef.current += 1;
      speakNext(indexRef.current);
    };
    utterance.onerror = () => {
      // e.g. the voice list changed mid-lesson — stop cleanly, don't loop.
      if (statusRef.current === 'playing') stop();
    };
    synth.speak(utterance);
  };

  const play = () => {
    const synth = window.speechSynthesis;
    // Clear any stuck state first (long-standing Chrome quirk).
    synth.cancel();
    const root = document.querySelector(articleSelector);
    const chunks = root ? extractLessonText(root) : [];
    if (chunks.length === 0) return;
    chunksRef.current = chunks;
    indexRef.current = 0;
    setStatus('playing');
    speakNext(0);
  };

  const toggle = () => {
    if (!supported) return;
    if (status === 'playing') {
      window.speechSynthesis.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
    } else {
      play();
    }
  };

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
          aria-label="Listening options: speed and voice"
          className={`${pillClass} rounded-l-none px-2.5`}
        >
          <Icon name="chevronDown" className="h-4 w-4" />
        </button>
      </div>

      {optionsOpen && (
        <div
          role="dialog"
          aria-label="Listening options"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-lift dark:border-stone-700 dark:bg-stone-900"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Speed
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={segmentClass(speed === s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Voice
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Voice preference">
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
          <p className="mt-3 text-xs leading-relaxed text-stone-400 dark:text-stone-500">
            Read aloud by your browser — voice quality varies by device. Speed
            and voice apply the next time you press play.
          </p>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}
