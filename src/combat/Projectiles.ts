import { Vector3 } from 'three';
import type { Level } from '../level/Level';
import { PALETTE } from '../render/palette';
import { segmentSphere, sweepWalls } from './raycast';
import type { Damageable, Effects, Faction } from './types';

export type ProjectileKind = 'laser' | 'missile';

export const WEAPON_TUNING = {
  laser: { speed: 110, damage: 10, life: 1.4 },
  missile: {
    speed: 34,
    damage: 40, // direct hit, on top of splash
    splashRadius: 4.5,
    splashDamage: 30,
    selfSplashFactor: 0.25, // fraction of splash the shooter's side takes
    turnRate: 6, // rad/s; turning radius = speed / turnRate ≈ 5.7 m
    proximityFuse: 0.5, // extra hit radius for missiles
    life: 6,
    seekRange: 70,
    seekConeCos: Math.cos((40 * Math.PI) / 180),
    retargetInterval: 0.25,
  },
};

export const PROJECTILE_COLORS: Record<Faction, number> = {
  player: PALETTE.cyan,
  enemy: PALETTE.red,
};

export interface Projectile {
  kind: ProjectileKind;
  faction: Faction;
  position: Vector3;
  velocity: Vector3;
  segment: number;
  life: number;
  target: Damageable | null;
  retarget: number;
  /** Multiplier on the kind's damage (robots fire weaker shots). */
  damageScale: number;
}

export interface SpawnOptions {
  speed?: number;
  damageScale?: number;
}

const _next = new Vector3();
const _hit = new Vector3();
const _normal = new Vector3();
const _desired = new Vector3();
const _axis = new Vector3();

/** Moves projectiles, resolves hits against walls, doors and damageables. */
export class ProjectileSystem {
  readonly projectiles: Projectile[] = [];
  /** Direct hits by player shots since last read (HUD hit marker). */
  playerHits = 0;

  constructor(
    private readonly level: Level,
    private readonly effects: Effects,
    private readonly damageables: () => readonly Damageable[],
  ) {}

  spawn(
    kind: ProjectileKind, faction: Faction, position: Vector3, direction: Vector3, segment: number,
    opts: SpawnOptions = {},
  ): Projectile {
    const speed = opts.speed ?? WEAPON_TUNING[kind].speed;
    const p: Projectile = {
      kind, faction,
      position: position.clone(),
      velocity: direction.clone().normalize().multiplyScalar(speed),
      segment,
      life: WEAPON_TUNING[kind].life,
      target: null,
      retarget: 0,
      damageScale: opts.damageScale ?? 1,
    };
    this.projectiles.push(p);
    return p;
  }

  update(dt: number): void {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!this.step(list[i], dt)) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  /** Advances one projectile; returns false when it is gone. */
  private step(p: Projectile, dt: number): boolean {
    p.life -= dt;
    if (p.life <= 0) {
      if (p.kind === 'missile') this.detonate(p, p.position, null);
      return false;
    }
    if (p.kind === 'missile') this.steer(p, dt);

    _next.copy(p.position).addScaledVector(p.velocity, dt);
    const wall = sweepWalls(this.level, p.segment, p.position, _next);
    let tBest = wall ? wall.t : Infinity;
    let victim: Damageable | null = null;
    for (const d of this.damageables()) {
      if (!d.alive || d.faction === p.faction) continue;
      const fuse = p.kind === 'missile' ? WEAPON_TUNING.missile.proximityFuse : 0;
      const t = segmentSphere(p.position, _next, d.position, d.radius + fuse);
      if (t >= 0 && t < tBest) { tBest = t; victim = d; }
    }

    if (victim && p.faction === 'player') this.playerHits++;
    if (victim || wall) {
      _hit.lerpVectors(p.position, _next, tBest);
      if (victim) _normal.subVectors(_hit, victim.position).normalize();
      else _normal.copy(wall!.normal);
      if (p.kind === 'missile') {
        this.detonate(p, _hit, victim);
      } else {
        victim?.damage(WEAPON_TUNING.laser.damage * p.damageScale, _hit);
        this.effects.impact(_hit, _normal, PROJECTILE_COLORS[p.faction]);
      }
      return false;
    }

    p.position.copy(_next);
    const seg = this.level.findSegment(p.position, p.segment);
    if (seg < 0) {
      // Slipped out through a crack between triangles: treat as a wall hit.
      this.effects.impact(p.position, _normal.copy(p.velocity).normalize().negate(), PROJECTILE_COLORS[p.faction]);
      return false;
    }
    p.segment = seg;
    if (p.kind === 'missile') this.effects.trail(p.position, PROJECTILE_COLORS[p.faction]);
    return true;
  }

  private steer(p: Projectile, dt: number): void {
    const cfg = WEAPON_TUNING.missile;
    p.retarget -= dt;
    if (p.retarget <= 0 || (p.target && !p.target.alive)) {
      p.retarget = cfg.retargetInterval;
      p.target = this.acquire(p);
    }
    if (!p.target) return;
    const speed = p.velocity.length();
    _desired.subVectors(p.target.position, p.position).normalize();
    const dir = p.velocity.clone().multiplyScalar(1 / speed);
    const angle = Math.acos(Math.min(1, Math.max(-1, dir.dot(_desired))));
    const maxTurn = cfg.turnRate * dt;
    if (angle <= maxTurn) {
      dir.copy(_desired);
    } else {
      _axis.crossVectors(dir, _desired);
      if (_axis.lengthSq() < 1e-10) return;
      dir.applyAxisAngle(_axis.normalize(), maxTurn);
    }
    p.velocity.copy(dir).multiplyScalar(speed);
  }

  /** Closest enemy inside the seeker cone with a clear line of sight. */
  private acquire(p: Projectile): Damageable | null {
    const cfg = WEAPON_TUNING.missile;
    const dir = p.velocity.clone().normalize();
    let best: Damageable | null = null;
    let bestDist = cfg.seekRange;
    for (const d of this.damageables()) {
      if (!d.alive || d.faction === p.faction) continue;
      const to = _desired.subVectors(d.position, p.position);
      const dist = to.length();
      if (dist >= bestDist || to.dot(dir) < cfg.seekConeCos * dist) continue;
      if (!this.level.lineOfSight(p.position, p.segment, d.position)) continue;
      best = d;
      bestDist = dist;
    }
    return best;
  }

  private detonate(p: Projectile, at: Vector3, direct: Damageable | null): void {
    const cfg = WEAPON_TUNING.missile;
    direct?.damage(cfg.damage * p.damageScale, at);
    this.explode(at, p.faction, cfg.splashDamage * p.damageScale, cfg.splashRadius, 1.4, PROJECTILE_COLORS[p.faction], p.segment);
  }

  /**
   * Splash damage with linear falloff from the hull, blocked by walls and
   * closed doors. The `faction`'s own side takes a reduced share.
   */
  explode(
    at: Vector3, faction: Faction, damage: number, radius: number, size: number, color: number,
    segment = -1, wreck = false,
  ): void {
    const cfg = WEAPON_TUNING.missile;
    this.effects.explosion(at, size, color, wreck);
    const seg = segment >= 0 ? segment : this.level.findSegment(at);
    for (const d of this.damageables()) {
      if (!d.alive) continue;
      const dist = d.position.distanceTo(at) - d.radius;
      if (dist >= radius) continue;
      if (seg >= 0 && dist > 0 && !this.level.lineOfSight(at, seg, d.position)) continue;
      const falloff = 1 - Math.max(0, dist) / radius;
      const factor = d.faction === faction ? cfg.selfSplashFactor : 1;
      d.damage(damage * falloff * factor, at);
    }
  }
}
