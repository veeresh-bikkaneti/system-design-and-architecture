import { describe, expect, it, vi } from 'vitest';
import { PausableTimer, type ScheduleFn } from './pausable-timer';

/** Manual scheduler: captures callbacks so tests fire them explicitly. */
function makeScheduler() {
  const scheduled: Array<{ cb: () => void; ms: number; cleared: boolean }> = [];
  const schedule: ScheduleFn = (cb, ms) => {
    const entry = { cb, ms, cleared: false };
    scheduled.push(entry);
    return { clear: () => { entry.cleared = true; } };
  };
  return { scheduled, schedule };
}

describe('PausableTimer', () => {
  it('fires onFire after the delay when untouched', () => {
    const { scheduled, schedule } = makeScheduler();
    const onFire = vi.fn();
    const timer = new PausableTimer(6000, onFire, schedule);
    timer.start();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(6000);
    scheduled[0].cb();
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('pauses while engaged and restarts the full delay on release', () => {
    const { scheduled, schedule } = makeScheduler();
    const onFire = vi.fn();
    const timer = new PausableTimer(6000, onFire, schedule);
    timer.start();
    timer.engage(); // hover in
    expect(scheduled[0].cleared).toBe(true);
    expect(onFire).not.toHaveBeenCalled();
    timer.release(); // hover out
    expect(scheduled).toHaveLength(2);
    expect(scheduled[1].cleared).toBe(false);
    scheduled[1].cb();
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('requires every nested engagement to release before restarting', () => {
    const { scheduled, schedule } = makeScheduler();
    const onFire = vi.fn();
    const timer = new PausableTimer(6000, onFire, schedule);
    timer.start();
    timer.engage(); // mouse in
    timer.engage(); // focus in
    timer.release(); // mouse out — focus still inside
    expect(scheduled).toHaveLength(1); // no restart yet
    timer.release(); // focus out
    expect(scheduled).toHaveLength(2); // restarted once
  });

  it('never fires after cancel (unmount)', () => {
    const { scheduled, schedule } = makeScheduler();
    const onFire = vi.fn();
    const timer = new PausableTimer(6000, onFire, schedule);
    timer.start();
    timer.cancel();
    expect(scheduled[0].cleared).toBe(true);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('tolerates release() with no matching engage()', () => {
    const { scheduled, schedule } = makeScheduler();
    const timer = new PausableTimer(6000, vi.fn(), schedule);
    timer.start();
    expect(() => timer.release()).not.toThrow();
    expect(scheduled).toHaveLength(2); // harmless re-arm, no crash
  });
});
