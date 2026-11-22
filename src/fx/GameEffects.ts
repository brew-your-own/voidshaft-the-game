import { Color, Group, Vector3 } from 'three';
import { NO_SOUND, type SoundName, type SoundSink } from '../audio/Audio';
import type { Effects } from '../combat/types';
import type { Level } from '../level/Level';
import { collideSphere } from '../physics/Collision';
import { DEBRIS_TUNING, DebrisPool, DebrisRenderer, type DebrisCollider } from './Debris';
import { LightPool } from './LightPool';
import { Particles } from './Particles';
import { Shockwaves } from './Shockwaves';

export const EXPLOSION_TUNING = {
  /** Shockwave pool size. */
  shockwaves: 8,
  /** Seconds a shockwave takes to expand and fade. */
  shockLife: 0.45,
  /** Shockwave radius per unit of explosion size, start and end. */
  shockStart: 0.25,
  shockEnd: 3.0,
  /** Shockwave brightness for plain blasts and for wrecks. */
  shockBrightness: 2.2,
  wreckShockBrightness: 3.5,
  /** Extra white-hot flash when something breaks apart (per unit of size). */
  wreckFlash: { intensity: 14, duration: 0.12, distance: 12 },
  /** Hull chunks thrown by a wreck: per unit of size, capped. */
  debrisPerSize: 6,
  debrisMax: 16,
  /** Chunk size (metres) at explosion size 1, before random variation. */
  debrisSize: 0.32,
  /** Chunk speed range (m/s) at explosion size 1. */
  debrisSpeed: [4, 11] as [number, number],
  /** Hull colour of chunks, and how much of the explosion colour mixes in. */
  debrisColor: 0x4a4560,
  debrisTint: 0.3,
  /** Chunks trail embers for this long, about one every `emberInterval` s. */
  emberTime: 0.9,
  emberInterval: 0.04,
};

const _v = new Vector3();
const _c = new Color();
const _hot = new Color();
const _tint = new Color();
const WHITE = new Color(0xffffff);
const HOT = new Color(0xffd27a);
const EMBER = new Color(0xff8a2a);

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
  readonly shockwaves = new Shockwaves(EXPLOSION_TUNING.shockwaves);
  readonly debris = new DebrisPool(DEBRIS_TUNING.capacity);
  private readonly debrisRenderer = new DebrisRenderer(this.debris);
  private level: Level | null = null;
  private collide: DebrisCollider | undefined;
  /** Called for every explosion (the game feeds camera shake from it). */
  onExplosion: ((pos: Vector3, size: number) => void) | null = null;

  constructor(private readonly audio: SoundSink = NO_SOUND) {
    this.object.add(this.particles.object, this.lights.object, this.shockwaves.object, this.debrisRenderer.mesh);
  }

  /** Lets debris bounce off this level's walls and closed doors. */
  setLevel(level: Level): void {
    this.level = level;
    this.collide = (pos, vel, radius, seg) => {
      collideSphere(level, seg, pos, vel, radius, DEBRIS_TUNING.bounce, 1);
      return level.containment(pos, seg) >= 0 ? seg : level.findSegment(pos, seg);
    };
  }

  sound(name: SoundName, pos?: Vector3, scale?: number): void {
    this.audio.play(name, pos, scale);
  }

  update(dt: number): void {
    this.debris.update(dt, this.collide);
    this.emitEmbers(dt);
    this.debrisRenderer.sync();
    this.shockwaves.update(dt);
    this.particles.update(dt);
    this.lights.update(dt);
  }

  muzzleFlash(pos: Vector3, color: number): void {
    this.lights.flash(pos, color, 0.6, 0.05, 6);
  }

  impact(pos: Vector3, normal: Vector3, color: number): void {
    const base = _tint.set(color).multiplyScalar(3);
    for (let i = 0; i < 12; i++) {
      randomUnit(_v);
      if (_v.dot(normal) < 0) _v.reflect(normal);
      _v.multiplyScalar(4 + Math.random() * 8);
      this.particles.emit({
        position: pos, velocity: _v,
        color: _c.copy(base).lerp(WHITE, Math.random() * 0.5),
        life: 0.25 + Math.random() * 0.3, drag: 0.02,
      });
    }
    this.lights.flash(pos, color, 1.0, 0.12, 8);
    this.audio.play('impact', pos);
  }

  explosion(pos: Vector3, size: number, color: number, wreck = false): void {
    const t = EXPLOSION_TUNING;
    const hot = _hot.copy(HOT).multiplyScalar(4);
    const tint = _tint.set(color).multiplyScalar(3);
    const count = Math.round(70 * size);
    for (let i = 0; i < count; i++) {
      randomUnit(_v).multiplyScalar((3 + Math.random() * 12) * size);
      this.particles.emit({
        position: pos, velocity: _v,
        color: _c.copy(i % 3 === 0 ? tint : hot).multiplyScalar(0.6 + Math.random() * 0.6),
        life: 0.4 + Math.random() * 0.7, drag: 0.05,
      });
    }
    // Slow glowing core.
    for (let i = 0; i < 20 * size; i++) {
      randomUnit(_v).multiplyScalar(Math.random() * 2 * size);
      this.particles.emit({ position: pos, velocity: _v, color: _c.copy(hot).multiplyScalar(1.5), life: 0.3 + Math.random() * 0.3 });
    }
    _c.set(color).multiplyScalar(wreck ? t.wreckShockBrightness : t.shockBrightness);
    this.shockwaves.spawn(pos, t.shockStart * size, t.shockEnd * size, t.shockLife * (0.8 + 0.2 * size), _c);
    if (wreck) {
      const f = t.wreckFlash;
      this.lights.flash(pos, 0xffffff, f.intensity * size, f.duration, f.distance * size);
      this.throwDebris(pos, size, color);
    }
    this.lights.flash(pos, 0xffb060, 8 * size, 0.5, 20 * size);
    this.audio.play('explosion', pos, size);
    this.onExplosion?.(pos, size);
  }

  trail(pos: Vector3, color: number): void {
    randomUnit(_v).multiplyScalar(0.6);
    this.particles.emit({
      position: pos, velocity: _v,
      color: _c.set(color).multiplyScalar(1.2).lerp(WHITE, 0.4),
      life: 0.35, drag: 0.1,
    });
  }

  private throwDebris(pos: Vector3, size: number, color: number): void {
    const t = EXPLOSION_TUNING;
    const n = Math.min(t.debrisMax, Math.round(t.debrisPerSize * size));
    const seg = this.level ? this.level.findSegment(pos) : -1;
    const k = Math.sqrt(size);
    _tint.set(t.debrisColor).lerp(_c.set(color), t.debrisTint);
    for (let i = 0; i < n; i++) {
      randomUnit(_v).multiplyScalar((t.debrisSpeed[0] + Math.random() * (t.debrisSpeed[1] - t.debrisSpeed[0])) * k);
      const chunk = this.debris.spawn(pos, _v, t.debrisSize * k * (0.6 + Math.random() * 0.6), seg);
      _c.copy(_tint).multiplyScalar(0.7 + Math.random() * 0.6);
      this.debrisRenderer.setColor(this.debris.chunks.indexOf(chunk), _c);
    }
  }

  /** Young chunks smoulder: an ember now and then at their position. */
  private emitEmbers(dt: number): void {
    const t = EXPLOSION_TUNING;
    const p = dt / t.emberInterval;
    for (const c of this.debris.chunks) {
      if (!c.active || c.age > t.emberTime || Math.random() > p) continue;
      const heat = 1 - c.age / t.emberTime;
      randomUnit(_v).multiplyScalar(0.4);
      this.particles.emit({
        position: c.position, velocity: _v,
        color: _c.copy(EMBER).multiplyScalar(1 + 2 * heat),
        life: 0.25 + 0.35 * heat, drag: 0.2,
      });
    }
  }
}
