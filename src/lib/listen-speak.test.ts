/**
 * Unit tests for lib/listen-speak.ts — the utterance lifecycle the
 * ListenButton delegates to. speechSynthesis is fully mocked (no DOM needed);
 * timers are faked so the start-watchdog behavior is deterministic.
 *
 * These tests pin the fix for the live-site report "UK voice selected, stuck
 * at Listening… and never speaks": the platform can drop an utterance
 * silently (no onstart/onend/onerror) when the selected voice can't be
 * instantiated, and the runner must retry once with the default voice and
 * then report the chunk unrecoverable — never strand, never loop forever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runChunk, type SynthLike } from './listen-speak';
import type { RankableVoice, VoicePreference } from './listen';

const WATCHDOG_MS = 5000;

const UK_VOICE: RankableVoice = { name: 'Google UK English Female', lang: 'en-GB' };
const US_VOICE: RankableVoice = { name: 'Google US English', lang: 'en-US' };
const FR_VOICE: RankableVoice = { name: 'Amélie', lang: 'fr-FR' };

interface FakeUtterance {
  text: string;
  rate: number;
  voice: RankableVoice | null;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

const makeUtterance = (text: string): FakeUtterance => ({
  text,
  rate: 1,
  voice: null,
  onstart: null,
  onend: null,
  onerror: null,
});

interface FakeSynth extends SynthLike {
  spoken: SpeechSynthesisUtterance[];
  cancelMock: ReturnType<typeof vi.fn>;
}

const makeSynth = (voices: RankableVoice[] = []): FakeSynth => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const cancelMock = vi.fn();
  return {
    spoken,
    cancelMock,
    getVoices: () => voices,
    speak: (u: SpeechSynthesisUtterance) => {
      spoken.push(u);
    },
    cancel: cancelMock,
  };
};

const startRun = (
  synth: FakeSynth,
  utterances: FakeUtterance[],
  preference: VoicePreference = 'uk',
) => {
  const onEnd = vi.fn();
  const onError = vi.fn();
  const onUnrecoverable = vi.fn();
  const handle = runChunk({
    synth,
    createUtterance: (text: string) => {
      const u = makeUtterance(text);
      utterances.push(u);
      return u as unknown as SpeechSynthesisUtterance;
    },
    text: 'chunk one',
    rate: 1.25,
    preference,
    startWatchdogMs: WATCHDOG_MS,
    onEnd,
    onError,
    onUnrecoverable,
  });
  return { handle, onEnd, onError, onUnrecoverable };
};

const fire = (u: FakeUtterance, which: 'onstart' | 'onend' | 'onerror'): void => {
  u[which]?.({} as Event);
};

describe('runChunk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns the ranked en-GB voice for the uk preference and applies the rate', () => {
    const synth = makeSynth([US_VOICE, UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle } = startRun(synth, utterances, 'uk');
    expect(utterances).toHaveLength(1);
    expect(utterances[0].voice?.name).toBe('Google UK English Female');
    expect(utterances[0].rate).toBe(1.25);
    expect(synth.spoken).toHaveLength(1);
    handle.dispose();
  });

  it('leaves utterance.voice unset when getVoices() is empty (voiceschanged has not fired yet)', () => {
    // voiceschanged timing: the first speak can happen before the platform
    // has any voices. The browser default then speaks — no crash, no strand.
    const synth = makeSynth([]);
    const utterances: FakeUtterance[] = [];
    const { handle } = startRun(synth, utterances, 'uk');
    expect(utterances[0].voice).toBeNull();
    expect(synth.spoken).toHaveLength(1);
    handle.dispose();
  });

  it('falls back to a US voice for the uk preference when no en-GB voice exists', () => {
    const synth = makeSynth([US_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle } = startRun(synth, utterances, 'uk');
    expect(utterances[0].voice?.name).toBe('Google US English');
    expect(synth.spoken).toHaveLength(1);
    handle.dispose();
  });

  it('leaves voice unset when no English voice exists at all', () => {
    const synth = makeSynth([FR_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle } = startRun(synth, utterances, 'uk');
    expect(utterances[0].voice).toBeNull();
    expect(synth.spoken).toHaveLength(1);
    handle.dispose();
  });

  it('advances on onend and disarms the watchdog', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onEnd, onUnrecoverable } = startRun(synth, utterances, 'uk');
    fire(utterances[0], 'onstart');
    fire(utterances[0], 'onend');
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(WATCHDOG_MS * 3);
    expect(onUnrecoverable).not.toHaveBeenCalled();
    expect(synth.cancelMock).not.toHaveBeenCalled();
    expect(synth.spoken).toHaveLength(1);
    handle.dispose();
  });

  it('reports onError when the platform errors and does not retry', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onError, onUnrecoverable } = startRun(synth, utterances, 'uk');
    fire(utterances[0], 'onerror');
    expect(onError).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(WATCHDOG_MS * 2);
    expect(synth.spoken).toHaveLength(1);
    expect(onUnrecoverable).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('on silent drop: cancels the ghost, retries once with the default voice, then reports unrecoverable', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onEnd, onError, onUnrecoverable } = startRun(synth, utterances, 'uk');
    // No events at all — the reported "stuck at Listening…" scenario.
    vi.advanceTimersByTime(WATCHDOG_MS);
    expect(synth.cancelMock).toHaveBeenCalledTimes(1);
    expect(synth.spoken).toHaveLength(2);
    expect(utterances).toHaveLength(2);
    expect(utterances[0].voice?.name).toBe('Google UK English Female');
    expect(utterances[1].voice).toBeNull(); // retry uses the browser default voice
    // Still silent on the retry → give up exactly once: no infinite loop.
    vi.advanceTimersByTime(WATCHDOG_MS);
    expect(onUnrecoverable).toHaveBeenCalledTimes(1);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.cancelMock).toHaveBeenCalledTimes(2);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('recovers via the default-voice retry when the preferred voice was the problem', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onEnd, onUnrecoverable } = startRun(synth, utterances, 'uk');
    vi.advanceTimersByTime(WATCHDOG_MS); // silent drop → retry with default
    expect(synth.spoken).toHaveLength(2);
    fire(utterances[1], 'onstart');
    fire(utterances[1], 'onend');
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(WATCHDOG_MS * 2);
    expect(onUnrecoverable).not.toHaveBeenCalled();
    expect(synth.spoken).toHaveLength(2);
    handle.dispose();
  });

  it('a slow-but-working voice that starts before the watchdog is left alone', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onUnrecoverable } = startRun(synth, utterances, 'uk');
    vi.advanceTimersByTime(WATCHDOG_MS - 100);
    fire(utterances[0], 'onstart');
    vi.advanceTimersByTime(10_000);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.cancelMock).not.toHaveBeenCalled();
    expect(onUnrecoverable).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('dispose() clears the watchdog so a late timer cannot resurrect playback', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onUnrecoverable } = startRun(synth, utterances, 'uk');
    handle.dispose();
    vi.advanceTimersByTime(WATCHDOG_MS * 2);
    expect(synth.spoken).toHaveLength(1);
    expect(onUnrecoverable).not.toHaveBeenCalled();
    expect(synth.cancelMock).not.toHaveBeenCalled();
  });

  it('hasStarted() is false before onstart and true after — the pause/resume contract', () => {
    // The component's toggle() reads this to decide the resume path:
    // paused-before-start → fresh utterance; paused-mid-chunk → resume().
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle } = startRun(synth, utterances, 'uk');
    expect(handle.hasStarted()).toBe(false);
    fire(utterances[0], 'onstart');
    expect(handle.hasStarted()).toBe(true);
    handle.dispose();
  });

  it('pause during the watchdog window: dispose() kills the run, no watchdog fires into the pause', () => {
    // Simulates the component's pause path when the utterance never started:
    // the run is disposed, the pending watchdog must not cancel/retry into
    // a paused synth, and hasStarted() stays false so resume() takes the
    // fresh-utterance path instead of resuming a dead queue.
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onEnd, onUnrecoverable } = startRun(synth, utterances, 'uk');
    handle.dispose(); // what toggle() does on pause-before-start
    expect(handle.hasStarted()).toBe(false);
    vi.advanceTimersByTime(WATCHDOG_MS * 3);
    expect(synth.spoken).toHaveLength(1); // no retry spoken
    expect(synth.cancelMock).not.toHaveBeenCalled(); // watchdog never fired
    expect(onUnrecoverable).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('late events after dispose() are ignored and cannot flip hasStarted()', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const { handle, onEnd } = startRun(synth, utterances, 'uk');
    handle.dispose();
    fire(utterances[0], 'onstart');
    fire(utterances[0], 'onend');
    expect(handle.hasStarted()).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('seek: dispose-then-cancel supersedes a started chunk without a stray onError/onEnd', () => {
    // What ListenButton.jumpTo does: dispose() BEFORE synth.cancel(), because
    // cancel() makes the platform fire an error/end on the old utterance —
    // which, if still live, would call stop() (onError) or double-advance
    // (onEnd) while the player is playing.
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const first = startRun(synth, utterances, 'uk');
    fire(utterances[0], 'onstart');
    first.handle.dispose();
    synth.cancel();
    fire(utterances[0], 'onerror');
    fire(utterances[0], 'onend');
    expect(first.onError).not.toHaveBeenCalled();
    expect(first.onEnd).not.toHaveBeenCalled();

    // The replacement run is independent and fully live.
    const second = startRun(synth, utterances, 'uk');
    fire(utterances[1], 'onstart');
    fire(utterances[1], 'onend');
    expect(second.onEnd).toHaveBeenCalledTimes(1);
    expect(first.onEnd).not.toHaveBeenCalled();
  });

  it('seek before the first chunk starts leaves no watchdog behind', () => {
    const synth = makeSynth([UK_VOICE]);
    const utterances: FakeUtterance[] = [];
    const first = startRun(synth, utterances, 'uk');
    first.handle.dispose();
    synth.cancel();
    const cancelsAfterSeek = synth.cancelMock.mock.calls.length;
    const second = startRun(synth, utterances, 'uk');
    fire(utterances[1], 'onstart');
    vi.advanceTimersByTime(WATCHDOG_MS * 3);
    expect(synth.cancelMock.mock.calls.length).toBe(cancelsAfterSeek);
    expect(first.onUnrecoverable).not.toHaveBeenCalled();
    expect(second.onUnrecoverable).not.toHaveBeenCalled();
    second.handle.dispose();
  });
});
