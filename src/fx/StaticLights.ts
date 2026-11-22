import { Group, PointLight, Vector3 } from 'three';
import type { LightData } from '../level/types';

export const STATIC_LIGHT_TUNING = {
  /** Point lights in the scene for the level's fixed lights. */
  slots: 12,
  /** Fade speed when a slot changes light (fraction of full per second). */
  fadeRate: 4,
  /** A light already shown counts this much closer, so slots don't flicker between two lights. */
  stickiness: 4,
  /** Light falloff exponent, as in three.js PointLight.decay. */
  decay: 1.4,
};

interface Slot {
  light: PointLight;
  /** Index into the level's lights, or -1 when empty. */
  source: number;
  /** Light to switch to once this slot has faded out, or -1. */
  next: number;
  /** 0..1 fade of the current source. */
  level: number;
}

const _v = new Vector3();

/**
 * Shows a big level's fixed lights through a constant number of point
 * lights. Each frame the lights whose range reaches closest to the camera get
 * a slot; a slot changing light fades out, then fades the new one in. Every
 * light costs on every lit pixel, so the slot count, not the level's light
 * count, sets the lighting cost. The count never changes, so materials are
 * not recompiled.
 */
export class StaticLights {
  readonly object = new Group();
  private readonly slots: Slot[];
  private readonly positions: Vector3[];

  constructor(
    private readonly lights: readonly LightData[],
    private readonly scale: number,
    slots = STATIC_LIGHT_TUNING.slots,
  ) {
    this.positions = lights.map((l) => new Vector3(...l.position));
    this.slots = Array.from({ length: slots }, () => {
      const light = new PointLight(0xffffff, 0, 1, STATIC_LIGHT_TUNING.decay);
      this.object.add(light);
      return { light, source: -1, next: -1, level: 0 };
    });
    // Small levels: every light gets a slot for good.
    if (lights.length <= slots) {
      lights.forEach((_, i) => this.assign(this.slots[i], i, 1));
    }
  }

  /** Indices of the lights currently shown (fully or fading). */
  get shown(): number[] {
    return this.slots.filter((s) => s.source >= 0).map((s) => s.source);
  }

  /** Picks the lights to show from `eye` and advances the fades. */
  update(dt: number, eye: Vector3): void {
    const n = this.slots.length;
    if (this.lights.length <= n) return;
    const current = new Set(this.slots.map((s) => s.source));
    const ranked = this.lights
      .map((l, i) => ({ i, score: _v.copy(this.positions[i]).distanceTo(eye) - l.distance - (current.has(i) ? STATIC_LIGHT_TUNING.stickiness : 0) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, n)
      .map((r) => r.i);
    const wanted = new Set(ranked);
    const placed = new Set<number>();
    for (const s of this.slots) {
      if (s.source >= 0 && wanted.has(s.source)) { placed.add(s.source); s.next = -1; }
      else if (s.next >= 0 && wanted.has(s.next)) placed.add(s.next);
      else s.next = -1;
    }
    const missing = ranked.filter((i) => !placed.has(i));
    for (const s of this.slots) {
      if (!missing.length) break;
      if (s.next < 0 && (s.source < 0 || !wanted.has(s.source))) s.next = missing.shift()!;
    }

    const step = dt * STATIC_LIGHT_TUNING.fadeRate;
    for (const s of this.slots) {
      if (s.next >= 0) {
        s.level -= step;
        if (s.level <= 0 || s.source < 0) { this.assign(s, s.next, 0); s.next = -1; }
      } else if (s.source >= 0 && s.level < 1) {
        s.level = Math.min(1, s.level + step);
      }
      if (s.source >= 0) s.light.intensity = this.lights[s.source].intensity * this.scale * Math.max(0, s.level);
    }
  }

  private assign(s: Slot, source: number, level: number): void {
    const l = this.lights[source];
    s.source = source;
    s.level = level;
    s.light.color.set(l.color);
    s.light.distance = l.distance;
    s.light.position.copy(this.positions[source]);
    s.light.intensity = l.intensity * this.scale * level;
  }
}
