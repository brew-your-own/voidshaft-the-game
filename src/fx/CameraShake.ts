import { Euler, Vector3 } from 'three';

export const SHAKE_TUNING = {
  /** Trauma lost per second (sustained level is not affected). */
  decay: 1.3,
  /** Trauma (and trauma + sustained) never exceeds this. */
  maxTrauma: 1,
  /** View offset at full shake, in metres (camera space). */
  maxOffset: 0.14,
  /** Pitch and yaw at full shake, in radians. */
  maxAngle: 0.035,
  /** Roll at full shake, in radians. */
  maxRoll: 0.06,
  /** Noise speed: rough "shakes per second". */
  frequency: 16,

  // What feeds it.
  /** Trauma from an explosion of size 1 right on top of the camera. */
  explosionPerSize: 0.35,
  /** Explosions further than this × (0.5 + 0.5 × size) add nothing. */
  explosionRange: 28,
  /** Most a single explosion can add. */
  explosionMax: 0.9,
  /** Trauma per point of damage taken, plus a floor per hit. */
  damagePerPoint: 0.012,
  damageBase: 0.12,
  damageMax: 0.6,
  /** A player missile launch: barely there. */
  missileLaunch: 0.12,
};

/** Trauma an explosion of `size` adds at `distance` from the camera. */
export function explosionTrauma(size: number, distance: number): number {
  const t = SHAKE_TUNING;
  const range = t.explosionRange * (0.5 + 0.5 * size);
  const f = 1 - distance / range;
  if (f <= 0) return 0;
  return Math.min(t.explosionMax, t.explosionPerSize * size * f * f);
}

/** Trauma for taking `amount` damage in one hit. */
export function damageTrauma(amount: number): number {
  const t = SHAKE_TUNING;
  if (amount <= 0) return 0;
  return Math.min(t.damageMax, t.damageBase + amount * t.damagePerPoint);
}

/** Smooth 1D value noise in [-1, 1]; `seed` picks an independent channel. */
export function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u);
}

function hash(i: number, seed: number): number {
  // Integer hash to [-1, 1].
  let h = Math.imul(i ^ Math.imul(seed + 1, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * View-only camera shake with the "trauma" model: events add trauma, which
 * decays linearly; the visible shake is trauma² so small hits stay subtle
 * and big ones kick hard. A sustained level (a continuous rumble) is added
 * on top and does not decay. Never move the physics body with this: apply
 * `offset` (camera space) and `rotation` to the rendered camera only.
 */
export class CameraShake {
  /** Turned off by the "Screen shake" setting: no output, trauma still tracked. */
  enabled = true;
  /** Camera-space offset for this frame. */
  readonly offset = new Vector3();
  /** Pitch (x), yaw (y) and roll (z) for this frame. */
  readonly rotation = new Euler();
  private trauma = 0;
  private sustained = 0;
  private time = 0;

  /** Adds a one-off kick (0–1 scale; 1 is the biggest blast). */
  add(amount: number): void {
    if (!(amount > 0)) return;
    this.trauma = Math.min(SHAKE_TUNING.maxTrauma, this.trauma + amount);
  }

  /** Sets a continuous rumble level (0–1) that holds until changed. */
  setSustained(level: number): void {
    this.sustained = Math.min(SHAKE_TUNING.maxTrauma, Math.max(0, level || 0));
  }

  get sustainedLevel(): number {
    return this.sustained;
  }

  /** Current decaying trauma (0–1). */
  get traumaLevel(): number {
    return this.trauma;
  }

  /** Visible shake strength (0–1): (trauma + sustained)², capped. */
  get intensity(): number {
    const level = Math.min(SHAKE_TUNING.maxTrauma, this.trauma + this.sustained);
    return level * level;
  }

  /** Decays trauma and recomputes `offset` and `rotation`. */
  update(dt: number): void {
    const t = SHAKE_TUNING;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - t.decay * dt);
    const s = this.enabled ? this.intensity : 0;
    if (s === 0) {
      this.offset.set(0, 0, 0);
      this.rotation.set(0, 0, 0);
      return;
    }
    const n = this.time * t.frequency;
    this.offset.set(
      smoothNoise(n, 0) * t.maxOffset * s,
      smoothNoise(n, 1) * t.maxOffset * s,
      smoothNoise(n, 2) * t.maxOffset * s * 0.5,
    );
    this.rotation.set(
      smoothNoise(n, 3) * t.maxAngle * s,
      smoothNoise(n, 4) * t.maxAngle * s,
      smoothNoise(n, 5) * t.maxRoll * s,
    );
  }

  reset(): void {
    this.trauma = 0;
    this.sustained = 0;
    this.offset.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
  }
}
