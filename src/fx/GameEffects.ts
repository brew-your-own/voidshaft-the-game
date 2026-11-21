import { Color, Group, Vector3 } from 'three';
import { NO_SOUND, type SoundName, type SoundSink } from '../audio/Audio';
import type { Effects } from '../combat/types';
import { LightPool } from './LightPool';
import { Particles } from './Particles';

const _v = new Vector3();
const _c = new Color();
const WHITE = new Color(0xffffff);

function randomUnit(out: Vector3): Vector3 {
  // Uniform direction on the sphere.
  const z = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), r * Math.sin(a), z);
}

/** Particle + light implementation of combat effects. */
export class GameEffects implements Effects {
  readonly object = new Group();
  readonly particles = new Particles();
  readonly lights = new LightPool();

  constructor(private readonly audio: SoundSink = NO_SOUND) {
    this.object.add(this.particles.object, this.lights.object);
  }

  sound(name: SoundName, pos?: Vector3, scale?: number): void {
    this.audio.play(name, pos, scale);
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.lights.update(dt);
  }

  muzzleFlash(pos: Vector3, color: number): void {
    this.lights.flash(pos, color, 0.6, 0.05, 6);
  }

  impact(pos: Vector3, normal: Vector3, color: number): void {
    const base = _c.set(color).multiplyScalar(3);
    for (let i = 0; i < 12; i++) {
      randomUnit(_v);
      if (_v.dot(normal) < 0) _v.reflect(normal);
      _v.multiplyScalar(4 + Math.random() * 8);
      this.particles.emit({
        position: pos, velocity: _v,
        color: base.clone().lerp(WHITE, Math.random() * 0.5),
        life: 0.25 + Math.random() * 0.3, drag: 0.02,
      });
    }
    this.lights.flash(pos, color, 1.0, 0.12, 8);
    this.audio.play('impact', pos);
  }

  explosion(pos: Vector3, size: number, color: number): void {
    const hot = new Color(0xffd27a).multiplyScalar(4);
    const tint = _c.set(color).multiplyScalar(3);
    const count = Math.round(70 * size);
    for (let i = 0; i < count; i++) {
      randomUnit(_v).multiplyScalar((3 + Math.random() * 12) * size);
      this.particles.emit({
        position: pos, velocity: _v,
        color: (i % 3 === 0 ? tint : hot).clone().multiplyScalar(0.6 + Math.random() * 0.6),
        life: 0.4 + Math.random() * 0.7, drag: 0.05,
      });
    }
    // Slow glowing core.
    for (let i = 0; i < 20 * size; i++) {
      randomUnit(_v).multiplyScalar(Math.random() * 2 * size);
      this.particles.emit({ position: pos, velocity: _v, color: hot.clone().multiplyScalar(1.5), life: 0.3 + Math.random() * 0.3 });
    }
    this.lights.flash(pos, 0xffb060, 8 * size, 0.5, 20 * size);
    this.audio.play('explosion', pos, size);
  }

  trail(pos: Vector3, color: number): void {
    randomUnit(_v).multiplyScalar(0.6);
    this.particles.emit({
      position: pos, velocity: _v,
      color: _c.set(color).multiplyScalar(1.2).lerp(WHITE, 0.4),
      life: 0.35, drag: 0.1,
    });
  }
}
