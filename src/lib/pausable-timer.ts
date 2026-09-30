/**
 * Countdown logic for auto-dismissing UI (used by BadgeToast) that pauses
 * while the user is engaged — hovering or with keyboard focus inside —
 * and restarts when they disengage.
 *
 * Pure logic with an injected scheduler so it stays testable without a
 * DOM: the React side (`usePausableDismiss` in BadgeToast.tsx) wires it
 * to `window.setTimeout`.
 */
export interface TimerHandle {
  clear(): void;
}

export type ScheduleFn = (cb: () => void, ms: number) => TimerHandle;

export class PausableTimer {
  private handle: TimerHandle | null = null;
  /** Nested engagements (hover + focus at once) must all release first. */
  private engagements = 0;
  private readonly delayMs: number;
  private readonly onFire: () => void;
  private readonly schedule: ScheduleFn;

  constructor(delayMs: number, onFire: () => void, schedule: ScheduleFn) {
    this.delayMs = delayMs;
    this.onFire = onFire;
    this.schedule = schedule;
  }

  /** Start (or restart) the countdown. */
  start(): void {
    this.arm();
  }

  /** User engaged (pointer entered / focus moved in): pause. */
  engage(): void {
    this.engagements += 1;
    this.disarm();
  }

  /**
   * User disengaged (pointer left / focus left the toast). Only restarts
   * once every engagement has released, so moving focus from the toast's
   * link to its dismiss button doesn't restart the clock mid-read.
   */
  release(): void {
    this.engagements = Math.max(0, this.engagements - 1);
    if (this.engagements === 0) this.arm();
  }

  /** Stop permanently (unmount). */
  cancel(): void {
    this.disarm();
    this.engagements = 0;
  }

  private arm(): void {
    this.disarm();
    this.handle = this.schedule(() => this.onFire(), this.delayMs);
  }

  private disarm(): void {
    this.handle?.clear();
    this.handle = null;
  }
}
