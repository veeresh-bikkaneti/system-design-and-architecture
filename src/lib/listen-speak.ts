/**
 * Side-effect orchestration for one "Listen" utterance chunk.
 *
 * `lib/listen.ts` stays pure (no `window.speechSynthesis`); this module owns
 * the impure part — resolving the voice, wiring utterance events, and the
 * start-watchdog — in a framework-agnostic form so unit tests can drive it
 * with a fully mocked speechSynthesis (no DOM required).
 *
 * Why the watchdog exists: Chromium does not guarantee utterance events.
 * When the selected voice can't be instantiated (e.g. an en-GB network voice
 * that never loaded — the "UK selected, stuck at Listening…" report), the
 * utterance can be dropped silently with no onstart/onend/onerror, which
 * used to strand the ListenButton at "Listening…" forever. The watchdog
 * retries the chunk once with the browser default voice, then reports the
 * chunk unrecoverable so the UI always settles instead of stranding.
 */

import { rankVoices, type RankableVoice, type VoicePreference } from './listen';

/** Smallest synth surface the runner touches (`window.speechSynthesis` satisfies this). */
export interface SynthLike {
  getVoices(): readonly RankableVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
}

export interface RunChunkOptions {
  synth: SynthLike;
  /** Build the platform utterance for this chunk's text. */
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  text: string;
  rate: number;
  preference: VoicePreference;
  /**
   * How long to wait for `onstart` before treating the utterance as silently
   * dropped. Generous enough for slow network voices, short enough that a
   * stuck button visibly recovers.
   */
  startWatchdogMs: number;
  /** The utterance finished normally — advance to the next chunk. */
  onEnd: () => void;
  /** The platform reported an error — stop cleanly. */
  onError: () => void;
  /**
   * The utterance never started AND the default-voice retry never started
   * either — nothing left to try; the caller should stop cleanly (idle).
   */
  onUnrecoverable: () => void;
}

export interface ChunkRun {
  /**
   * Clear the pending watchdog. Call when the run is superseded — stop(),
   * unmount, or the next chunk — so a late timer can't resurrect playback.
   */
  dispose(): void;
  /**
   * True once the platform fired `onstart` for any utterance of this run.
   * Lets the caller distinguish "paused mid-chunk" (resume the queued
   * utterance) from "paused before anything started" (the run is dead —
   * start a fresh utterance on resume instead of stranding the UI).
   */
  hasStarted(): boolean;
}

/**
 * Speak one chunk. Resolves the voice synchronously at call time (keeps the
 * `speak()` inside the user's click-gesture task, which some platforms
 * require), then guards the utterance with a start-watchdog.
 */
export function runChunk(opts: RunChunkOptions): ChunkRun {
  let disposeCurrent: (() => void) | null = null;
  let done = false;
  let everStarted = false;

  const attempt = (useDefaultVoice: boolean): void => {
    if (done) return;
    const utterance = opts.createUtterance(opts.text);
    utterance.rate = opts.rate;
    if (!useDefaultVoice) {
      // `getVoices()` is empty until the platform fires `voiceschanged`;
      // rankVoices returns null then and the voice is simply left unset so
      // the browser default speaks — never crash, never strand.
      const ranked = rankVoices(opts.synth.getVoices(), opts.preference);
      // `ranked` came from the platform's own voice list, so it really is a
      // SpeechSynthesisVoice; the RankableVoice view just keeps rankVoices
      // unit-testable with minimal fakes.
      if (ranked) utterance.voice = ranked as SpeechSynthesisVoice;
    }
    let started = false;
    let settled = false;
    const timer = setTimeout(() => {
      if (done || started || settled) return;
      settled = true;
      // The utterance never started and the platform reported nothing:
      // drop the ghost from the queue, then retry once with the browser
      // default voice before giving up.
      opts.synth.cancel();
      if (useDefaultVoice) {
        done = true;
        opts.onUnrecoverable();
      } else {
        attempt(true);
      }
    }, opts.startWatchdogMs);
    disposeCurrent = () => clearTimeout(timer);
    const settle = (): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
      }
    };
    utterance.onstart = () => {
      if (done) return;
      everStarted = true;
      started = true;
      settle();
    };
    utterance.onend = () => {
      if (done) return;
      settle();
      done = true;
      opts.onEnd();
    };
    utterance.onerror = () => {
      if (done) return;
      settle();
      done = true;
      opts.onError();
    };
    opts.synth.speak(utterance);
  };

  attempt(false);

  return {
    dispose: () => {
      done = true;
      disposeCurrent?.();
      disposeCurrent = null;
    },
    hasStarted: () => everStarted,
  };
}
