import { Group, PointLight, type Vector3 } from 'three';

interface Slot {
  light: PointLight;
  peak: number;
  time: number;
  duration: number;
}

/**
 * A fixed number of point lights reused for short flashes. The count never
 * changes, so materials are not recompiled when flashes start or stop.
 */
export class LightPool {
  readonly object = new Group();
  private readonly slots: Slot[];

  constructor(size = 6) {
    this.slots = Array.from({ length: size }, () => {
      const light = new PointLight(0xffffff, 0, 18, 1.6);
      this.object.add(light);
      return { light, peak: 0, time: 0, duration: 1 };
    });
  }

  flash(pos: Vector3, color: number, intensity: number, duration: number, distance = 18): void {
    // Reuse a free slot, or the one closest to finishing.
    let slot = this.slots[0];
    let best = Infinity;
    for (const s of this.slots) {
      const remaining = Math.max(0, s.duration - s.time) * s.peak;
      if (remaining < best) { best = remaining; slot = s; }
    }
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.peak = intensity;
    slot.time = 0;
    slot.duration = duration;
    slot.light.intensity = intensity;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.light.intensity === 0) continue;
      s.time += dt;
      const f = 1 - s.time / s.duration;
      s.light.intensity = f > 0 ? s.peak * f * f : 0;
    }
  }
}
