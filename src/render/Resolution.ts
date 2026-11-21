/** Thresholds for adaptive resolution, in seconds per frame. */
export const RESOLUTION_TUNING = {
  /** Smoothed frame time above this counts as slow (under ~50 fps). */
  slowFrame: 1 / 50,
  /** Smoothed frame time below this counts as comfortable (over ~57 fps). */
  fastFrame: 1 / 57,
  /** Seconds of slow frames before stepping down. */
  downAfter: 0.75,
  /** Seconds of fast frames before stepping back up; doubles after each drop. */
  upAfter: 4,
  step: 0.1,
  min: 0.5,
  /** Smoothing time constant for the frame time. */
  smoothing: 0.4,
};

/**
 * Picks a resolution multiplier from recent frame times: steps down while
 * frames are slow and creeps back up when there is headroom. Each drop makes
 * the next climb slower, so it settles instead of bouncing.
 */
export class ResolutionGovernor {
  /** Multiplier on the user's render scale, from `min` to 1. */
  scale = 1;
  private smoothed = 1 / 60;
  private slowTime = 0;
  private fastTime = 0;
  private drops = 0;

  /** Feeds one frame; returns true when `scale` changed. */
  update(dt: number, enabled: boolean): boolean {
    const t = RESOLUTION_TUNING;
    if (!enabled) {
      const changed = this.scale !== 1;
      this.reset();
      return changed;
    }
    if (dt <= 0) return false;
    // Cap each sample so one long hitch can't drag the average for long.
    const sample = Math.min(dt, t.slowFrame * 2);
    this.smoothed += (sample - this.smoothed) * Math.min(1, dt / t.smoothing);
    if (this.smoothed > t.slowFrame) {
      this.slowTime += dt;
      this.fastTime = 0;
    } else if (this.smoothed < t.fastFrame) {
      this.fastTime += dt;
      this.slowTime = 0;
    } else {
      this.slowTime = this.fastTime = 0;
    }
    if (this.slowTime >= t.downAfter && this.scale > t.min) {
      this.scale = Math.max(t.min, round(this.scale - t.step));
      this.drops++;
      this.slowTime = 0;
      // Assume the new resolution helps; judge it on fresh frames.
      this.smoothed = (t.slowFrame + t.fastFrame) / 2;
      return true;
    }
    if (this.fastTime >= t.upAfter * 2 ** Math.min(this.drops, 4) && this.scale < 1) {
      this.scale = Math.min(1, round(this.scale + t.step));
      this.fastTime = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.scale = 1;
    this.smoothed = 1 / 60;
    this.slowTime = this.fastTime = 0;
    this.drops = 0;
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
