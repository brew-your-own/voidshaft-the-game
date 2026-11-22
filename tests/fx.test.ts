import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraShake, SHAKE_TUNING, damageTrauma, explosionTrauma, smoothNoise } from '../src/fx/CameraShake';
import { DEBRIS_TUNING, DebrisPool } from '../src/fx/Debris';
import { HIT_FLASH_TUNING, hitFlashStrength } from '../src/render/HitFlashPass';

describe('CameraShake', () => {
  it('is still with no trauma', () => {
    const s = new CameraShake();
    s.update(0.1);
    expect(s.intensity).toBe(0);
    expect(s.offset.length()).toBe(0);
    expect(s.rotation.x).toBe(0);
  });

  it('caps trauma and makes the visible shake trauma²', () => {
    const s = new CameraShake();
    s.add(0.5);
    expect(s.intensity).toBeCloseTo(0.25);
    s.add(5);
    expect(s.traumaLevel).toBe(SHAKE_TUNING.maxTrauma);
    expect(s.intensity).toBe(1);
    s.add(-1); // ignored
    s.add(Number.NaN); // ignored
    expect(s.traumaLevel).toBe(SHAKE_TUNING.maxTrauma);
  });

  it('decays trauma linearly to zero', () => {
    const s = new CameraShake();
    s.add(1);
    s.update(0.25);
    expect(s.traumaLevel).toBeCloseTo(1 - SHAKE_TUNING.decay * 0.25);
    for (let i = 0; i < 100; i++) s.update(0.05);
    expect(s.traumaLevel).toBe(0);
    expect(s.offset.length()).toBe(0);
  });

  it('keeps offsets and angles within the caps', () => {
    const s = new CameraShake();
    const t = SHAKE_TUNING;
    for (let i = 0; i < 500; i++) {
      s.add(1);
      s.update(1 / 120);
      expect(Math.abs(s.offset.x)).toBeLessThanOrEqual(t.maxOffset + 1e-9);
      expect(Math.abs(s.offset.y)).toBeLessThanOrEqual(t.maxOffset + 1e-9);
      expect(Math.abs(s.rotation.x)).toBeLessThanOrEqual(t.maxAngle + 1e-9);
      expect(Math.abs(s.rotation.z)).toBeLessThanOrEqual(t.maxRoll + 1e-9);
    }
  });

  it('moves smoothly between frames', () => {
    const s = new CameraShake();
    s.setSustained(1);
    s.update(1 / 120);
    let prev = s.offset.x;
    for (let i = 0; i < 200; i++) {
      s.update(1 / 120);
      expect(Math.abs(s.offset.x - prev)).toBeLessThan(SHAKE_TUNING.maxOffset * 0.5);
      prev = s.offset.x;
    }
  });

  it('holds a sustained level that does not decay, on top of trauma', () => {
    const s = new CameraShake();
    s.setSustained(0.4);
    for (let i = 0; i < 100; i++) s.update(0.05);
    expect(s.sustainedLevel).toBe(0.4);
    expect(s.intensity).toBeCloseTo(0.16);
    s.add(0.3);
    expect(s.intensity).toBeCloseTo(0.49);
    s.add(1);
    expect(s.intensity).toBe(1); // capped
    s.setSustained(7);
    expect(s.sustainedLevel).toBe(SHAKE_TUNING.maxTrauma);
    s.setSustained(-1);
    expect(s.sustainedLevel).toBe(0);
  });

  it('outputs nothing when disabled, but still tracks trauma', () => {
    const s = new CameraShake();
    s.enabled = false;
    s.add(1);
    s.setSustained(1);
    s.update(0.1);
    expect(s.offset.length()).toBe(0);
    expect(s.rotation.y).toBe(0);
    expect(s.traumaLevel).toBeGreaterThan(0);
  });

  it('noise stays in [-1, 1] and is continuous', () => {
    let prev = smoothNoise(0, 3);
    for (let t = 0.01; t < 50; t += 0.01) {
      const v = smoothNoise(t, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe('shake feeds', () => {
  it('explosions shake less with distance and nothing past their range', () => {
    const near = explosionTrauma(1, 1);
    const mid = explosionTrauma(1, 8);
    const far = explosionTrauma(1, 1000);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
    expect(far).toBe(0);
    expect(explosionTrauma(1, 0)).toBeCloseTo(SHAKE_TUNING.explosionPerSize);
  });

  it('bigger explosions shake harder and reach further, up to a cap', () => {
    expect(explosionTrauma(2, 10)).toBeGreaterThan(explosionTrauma(1, 10));
    const range1 = SHAKE_TUNING.explosionRange;
    expect(explosionTrauma(1, range1 * 0.99)).toBeGreaterThan(0);
    expect(explosionTrauma(1, range1)).toBe(0);
    expect(explosionTrauma(3, range1 * 1.5)).toBeGreaterThan(0);
    expect(explosionTrauma(50, 0)).toBe(SHAKE_TUNING.explosionMax);
  });

  it('damage trauma grows with damage and is capped', () => {
    expect(damageTrauma(0)).toBe(0);
    expect(damageTrauma(10)).toBeGreaterThan(damageTrauma(2));
    expect(damageTrauma(1000)).toBe(SHAKE_TUNING.damageMax);
  });

  it('hit flash strength grows with damage and is capped at 1', () => {
    expect(hitFlashStrength(0)).toBe(0);
    expect(hitFlashStrength(1)).toBeCloseTo(HIT_FLASH_TUNING.base + HIT_FLASH_TUNING.perPoint);
    expect(hitFlashStrength(500)).toBe(1);
  });
});

describe('DebrisPool', () => {
  const at = new Vector3(1, 2, 3);
  const vel = new Vector3(5, 0, 0);
  const rng = () => 0.5;

  it('spawns into free slots and moves and spins chunks', () => {
    const pool = new DebrisPool(4);
    const c = pool.spawn(at, vel, 0.3, 0, rng);
    expect(pool.activeCount).toBe(1);
    const q = c.rotation.clone();
    pool.update(0.1);
    expect(c.position.x).toBeGreaterThan(1.3);
    expect(c.position.x).toBeLessThan(1.5); // drag slowed it
    expect(c.rotation.equals(q)).toBe(false);
  });

  it('reuses the oldest chunk when full, never growing', () => {
    const pool = new DebrisPool(3);
    const first = pool.spawn(at, vel, 0.3, 0, rng);
    pool.update(0.5);
    pool.spawn(at, vel, 0.3, 0, rng);
    pool.spawn(at, vel, 0.3, 0, rng);
    expect(pool.activeCount).toBe(3);
    const fourth = pool.spawn(at, vel, 0.3, 0, rng);
    expect(fourth).toBe(first); // least life left
    expect(fourth.age).toBe(0);
    expect(pool.chunks.length).toBe(3);
    expect(pool.activeCount).toBe(3);
  });

  it('expires chunks after their life and shrinks them first', () => {
    const pool = new DebrisPool(2);
    const c = pool.spawn(at, vel, 0.3, 0, rng);
    expect(DebrisPool.fadeScale(c)).toBe(1);
    pool.update(c.maxLife - DEBRIS_TUNING.fade / 2);
    expect(DebrisPool.fadeScale(c)).toBeGreaterThan(0);
    expect(DebrisPool.fadeScale(c)).toBeLessThan(1);
    pool.update(DEBRIS_TUNING.fade);
    expect(c.active).toBe(false);
    expect(DebrisPool.fadeScale(c)).toBe(0);
    expect(pool.activeCount).toBe(0);
    // The freed slot is used again.
    expect(pool.spawn(at, vel, 0.3, 0, rng)).toBe(c);
  });

  it('bounces off walls through the collider and drops chunks that leave the level', () => {
    const pool = new DebrisPool(2);
    // A wall at x = 2 facing -x.
    const wall = (pos: Vector3, v: Vector3, radius: number, seg: number) => {
      if (pos.x + radius > 2) {
        pos.x = 2 - radius;
        if (v.x > 0) v.x = -v.x * DEBRIS_TUNING.bounce;
      }
      return seg;
    };
    const c = pool.spawn(new Vector3(0, 0, 0), new Vector3(10, 0, 0), 0.3, 0, rng);
    pool.update(0.5, wall);
    expect(c.velocity.x).toBeLessThan(0);
    expect(c.position.x).toBeLessThan(2);

    const lost = pool.spawn(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0.3, 0, rng);
    pool.update(0.1, () => -1);
    expect(lost.active).toBe(false);
  });

  it('substeps fast chunks so the collider sees every short move', () => {
    const pool = new DebrisPool(1);
    let calls = 0;
    pool.spawn(at, vel, 0.3, 0, rng);
    pool.update(0.1, (_p, _v, _r, seg) => { calls++; return seg; });
    expect(calls).toBe(Math.ceil(0.1 / DEBRIS_TUNING.maxStep));
  });
});

describe('shockwave near fade', () => {
  it('hides a blast around the camera and shows a distant one', async () => {
    const { nearFade } = await import('../src/fx/Shockwaves');
    expect(nearFade(0, 2)).toBe(0);
    expect(nearFade(2.4, 2)).toBe(0);
    expect(nearFade(6, 2)).toBe(1);
    expect(nearFade(4, 2)).toBeGreaterThan(0);
    expect(nearFade(4, 2)).toBeLessThan(1);
  });
});
