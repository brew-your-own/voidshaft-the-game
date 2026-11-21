import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import type { ProjectileSystem } from '../../combat/Projectiles';
import type { Damageable, Effects } from '../../combat/types';
import type { Level } from '../../level/Level';
import type { RobotData, RobotType } from '../../level/types';
import { collideSphere } from '../../physics/Collision';
import { buildRobotMesh, type RobotMesh } from './RobotMeshes';
import { ROBOT_TUNING, type GunTuning, type RobotTuning } from './tuning';

export type RobotState = 'patrol' | 'attack' | 'chase' | 'flee';

/** What robots need to know about the player. */
export interface RobotQuarry {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly segment: number;
  readonly alive: boolean;
}

/** Shared world access for all robots. */
export interface RobotWorld {
  level: Level;
  projectiles: ProjectileSystem;
  effects: Effects;
  player: RobotQuarry;
  robots: readonly Robot[];
  rng: () => number;
  onDeath(robot: Robot): void;
}

export const AI_TUNING = {
  senseInterval: 0.2,
  /** Seconds without sight before giving up the hunt. */
  forgetAfter: 8,
  replanInterval: 0.5,
  /** Reaction delay before the first shot after spotting the player. */
  reaction: [0.4, 0.9] as [number, number],
  alertRadius: 18,
  fleeTime: 4,
  arriveDistance: 1.5,
};

const FORWARD = new Vector3(0, 0, -1);
const WORLD_UP = new Vector3(0, 1, 0);
const WHITE = new Color(4, 4, 4);
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _desired = new Vector3();
const _origin = new Vector3();

/** A hostile robot: a sphere body steered by a small state machine. */
export class Robot implements Damageable {
  readonly faction = 'enemy' as const;
  readonly tuning: RobotTuning;
  readonly radius: number;
  readonly position: Vector3;
  readonly prevPosition: Vector3;
  readonly velocity = new Vector3();
  readonly quaternion = new Quaternion();
  readonly mesh: RobotMesh;
  readonly home: number;
  segment: number;
  alive = true;
  hp: number;
  state: RobotState = 'patrol';

  // Perception.
  canSee = false;
  readonly lastSeen = new Vector3();
  lastSeenSegment = -1;
  private lostTime = Infinity;
  private senseTimer: number;

  // Navigation.
  private path: number[] | null = null;
  private pathGoal = -1;
  private replanTimer = 0;
  private readonly waypoint = new Vector3();
  private waypointSegment = -1;
  private pause = 0;
  private readonly strafeDir = new Vector3();
  private strafeTimer = 0;
  private fleeTimer = 0;
  private fled = false;

  // Weapons.
  private readonly gunTimers: number[];
  private readonly burstLeft: number[];
  private flash = 0;
  private time: number;

  constructor(readonly type: RobotType, data: RobotData, private readonly world: RobotWorld) {
    this.tuning = ROBOT_TUNING[type];
    this.radius = this.tuning.radius;
    this.hp = this.tuning.hp;
    this.position = new Vector3(...data.position);
    this.prevPosition = this.position.clone();
    this.segment = this.home = data.segment;
    this.senseTimer = world.rng() * AI_TUNING.senseInterval;
    this.time = world.rng() * 10;
    this.gunTimers = this.tuning.guns.map((g) => g.interval * world.rng());
    this.burstLeft = this.tuning.guns.map(() => 0);
    this.quaternion.setFromAxisAngle(WORLD_UP, world.rng() * Math.PI * 2);
    this.mesh = buildRobotMesh(type);
    this.mesh.object.position.copy(this.position);
    this.mesh.object.quaternion.copy(this.quaternion);
  }

  get object() {
    return this.mesh.object;
  }

  get forward(): Vector3 {
    return _w.copy(FORWARD).applyQuaternion(this.quaternion);
  }

  damage(amount: number, hitPoint: Vector3): void {
    if (!this.alive || amount <= 0) return;
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.die(false);
      return;
    }
    this.world.effects.impact(hitPoint, _v.subVectors(hitPoint, this.position).normalize(), 0xffffff);
    // Being shot reveals the shooter's position.
    const p = this.world.player;
    if (p.alive) this.alert(p.position, p.segment, true);
  }

  /** Learn where the player is; optionally tell nearby robots too. */
  alert(pos: Vector3, seg: number, propagate: boolean): void {
    this.lastSeen.copy(pos);
    this.lastSeenSegment = seg;
    this.lostTime = Math.min(this.lostTime, 0);
    if (this.state === 'patrol') this.engage();
    if (!propagate) return;
    for (const r of this.world.robots) {
      if (r === this || !r.alive || r.state !== 'patrol') continue;
      if (r.position.distanceTo(this.position) > AI_TUNING.alertRadius) continue;
      if (!this.world.level.lineOfSight(this.position, this.segment, r.position)) continue;
      r.alert(pos, seg, false);
    }
  }

  /** Fixed-step update: perception, decisions, movement, weapons. */
  update(dt: number): void {
    if (!this.alive) return;
    this.time += dt;
    this.replanTimer -= dt;
    this.sense(dt);
    this.think(dt);
    this.move(dt);
    this.updateVisuals(dt);
  }

  /** Interpolates the rendered model between simulation steps. */
  syncObject(alpha: number): void {
    this.mesh.object.position.lerpVectors(this.prevPosition, this.position, alpha);
  }

  // ---------------------------------------------------------------- perception

  private sense(dt: number): void {
    this.senseTimer -= dt;
    this.lostTime += dt;
    if (this.senseTimer > 0) return;
    this.senseTimer = AI_TUNING.senseInterval;

    const p = this.world.player;
    const t = this.tuning;
    this.canSee = false;
    if (!p.alive) return;
    _v.subVectors(p.position, this.position);
    const dist = _v.length();
    if (dist > t.sightRange) return;
    // Patrolling robots only notice what's in front of them, or close by.
    if (this.state === 'patrol' && dist > t.hearRange && _v.dot(this.forward) < t.sightConeCos * dist) return;
    if (!this.world.level.lineOfSight(this.position, this.segment, p.position)) return;
    this.canSee = true;
    this.lostTime = 0;
    const wasPatrolling = this.state === 'patrol';
    this.lastSeen.copy(p.position);
    this.lastSeenSegment = p.segment;
    if (wasPatrolling) {
      this.world.effects.sound('alert', this.position);
      this.alert(p.position, p.segment, true);
    }
  }

  /** Switches from patrol to combat, with a short reaction delay. */
  private engage(): void {
    this.state = 'chase';
    const [lo, hi] = AI_TUNING.reaction;
    for (let i = 0; i < this.gunTimers.length; i++) {
      this.gunTimers[i] = Math.max(this.gunTimers[i], lo + (hi - lo) * this.world.rng());
    }
  }

  // ----------------------------------------------------------------- decisions

  private think(dt: number): void {
    const t = this.tuning;
    if (this.state !== 'flee' && !this.fled && t.fleeAt > 0 && this.hp < t.hp * t.fleeAt) {
      this.state = 'flee';
      this.fled = true;
      this.fleeTimer = AI_TUNING.fleeTime;
      this.waypointSegment = -1;
    }

    switch (this.state) {
      case 'patrol':
        this.patrol(dt);
        break;
      case 'attack':
        if (!this.canSee) { this.state = 'chase'; this.chase(); break; }
        this.attack(dt);
        break;
      case 'chase':
        if (this.canSee) { this.state = 'attack'; this.attack(dt); break; }
        if (this.lostTime > AI_TUNING.forgetAfter) {
          this.state = 'patrol';
          this.waypointSegment = -1;
          _desired.set(0, 0, 0);
          break;
        }
        this.chase();
        break;
      case 'flee':
        this.fleeTimer -= dt;
        if (this.fleeTimer <= 0) { this.state = 'chase'; this.waypointSegment = -1; break; }
        this.flee();
        break;
    }
    this.updateGuns(dt);
    if (this.tuning.ram) this.checkRam();
  }

  private patrol(dt: number): void {
    const level = this.world.level;
    if (this.waypointSegment < 0) {
      // Pick a random point in a segment within reach of home.
      const options = level.neighbourhood(this.home, this.tuning.patrolHops)
        .filter((s) => level.findPath(this.segment, s, this.passable) !== null);
      const seg = options[Math.floor(this.world.rng() * options.length)] ?? this.segment;
      this.randomPointIn(seg, this.waypoint);
      this.waypointSegment = seg;
      this.pause = 0;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.waypointSegment = -1;
      _desired.set(0, 0, 0);
      this.face(null, dt);
      return;
    }
    const arrived = this.navigate(this.waypoint, this.waypointSegment, 0.35);
    if (arrived) this.pause = 1 + this.world.rng() * 2;
    this.face(null, dt);
  }

  private chase(): void {
    // Head to where the player was last seen.
    const arrived = this.navigate(this.lastSeen, this.lastSeenSegment, 0.8);
    if (arrived) _desired.set(0, 0, 0);
  }

  private attack(dt: number): void {
    const t = this.tuning;
    const p = this.world.player;
    const to = _v.subVectors(p.position, this.position);
    const dist = to.length();
    to.multiplyScalar(1 / Math.max(dist, 1e-6));

    if (t.ram) {
      // Kamikaze: straight at the predicted position.
      _desired.copy(p.position).addScaledVector(p.velocity, (dist / t.speed) * t.lead)
        .sub(this.position).setLength(t.speed);
      return;
    }

    // Keep within the preferred band and circle sideways.
    const radial = dist > t.range[1] ? 1 : dist < t.range[0] ? -1 : 0;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0 || this.strafeDir.lengthSq() === 0) {
      this.strafeTimer = 1.2 + this.world.rng() * 1.8;
      randomPerpendicular(to, this.strafeDir, this.world.rng);
    }
    _desired.copy(to).multiplyScalar(radial).addScaledVector(this.strafeDir, t.strafe);
    if (_desired.lengthSq() > 1) _desired.normalize();
    _desired.multiplyScalar(t.speed);
  }

  private flee(): void {
    const level = this.world.level;
    if (this.waypointSegment < 0) {
      // Run to the reachable segment farthest (in hops) from the player.
      let best = this.segment;
      let bestScore = -Infinity;
      for (const s of level.neighbourhood(this.segment, 3)) {
        if (!level.findPath(this.segment, s, this.passable)) continue;
        const hops = level.findPath(this.world.player.segment, s)?.length ?? 99;
        const score = hops * 10 + level.segments[s].center.distanceTo(this.world.player.position) * 0.1;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      this.waypointSegment = best;
      this.waypoint.copy(level.segments[best].center);
    }
    if (this.navigate(this.waypoint, this.waypointSegment, 1)) _desired.set(0, 0, 0);
  }

  /**
   * Sets the desired velocity toward `goal`, routing through portals when it
   * lies in another segment. Returns true once arrived.
   */
  private navigate(goal: Vector3, goalSeg: number, speedFactor: number): boolean {
    const level = this.world.level;
    const speed = this.tuning.speed * speedFactor;
    let target = goal;
    if (goalSeg >= 0 && goalSeg !== this.segment) {
      if (!this.path || this.pathGoal !== goalSeg || this.replanTimer <= 0 || this.path[0] !== this.segment) {
        this.path = level.findPath(this.segment, goalSeg, this.passable);
        this.pathGoal = goalSeg;
        this.replanTimer = AI_TUNING.replanInterval;
      }
      if (!this.path || this.path.length < 2) {
        // Unreachable (closed door in the way): wait here.
        _desired.set(0, 0, 0);
        return true;
      }
      const side = level.segments[this.segment].children.indexOf(this.path[1]);
      target = level.sideCenter(this.segment, side, _origin);
      // Aim a little past the portal so we don't stall on its plane.
      target.lerp(level.segments[this.path[1]].center, 0.25);
      _desired.subVectors(target, this.position).setLength(speed);
      return false;
    }
    _desired.subVectors(target, this.position);
    const dist = _desired.length();
    if (dist < AI_TUNING.arriveDistance) return true;
    // Slow down on arrival.
    _desired.multiplyScalar((speed * Math.min(1, dist / 4)) / dist);
    return false;
  }

  private readonly passable = (seg: number, side: number): boolean =>
    !this.world.level.doorAt(seg, side)?.solid;

  private randomPointIn(seg: number, out: Vector3): Vector3 {
    const level = this.world.level;
    const s = level.segments[seg];
    const v = level.vertices[s.verts[Math.floor(this.world.rng() * 8)]];
    return out.copy(s.center).lerp(v, 0.15 + this.world.rng() * 0.35);
  }

  // ------------------------------------------------------------------- weapons

  private updateGuns(dt: number): void {
    const t = this.tuning;
    const p = this.world.player;
    for (let i = 0; i < t.guns.length; i++) {
      this.gunTimers[i] -= dt;
      if (this.gunTimers[i] > 0) continue;
      const gun = t.guns[i];
      const inVolley = this.burstLeft[i] > 0;
      if (!inVolley && (this.state !== 'attack' || !this.canSee || !p.alive)) continue;
      const aim = this.aimDirection(gun, _v);
      if (!inVolley && aim.dot(this.forward) < t.fireConeCos) continue;
      this.fire(gun, aim);
      if (!inVolley) this.burstLeft[i] = gun.burst;
      this.burstLeft[i]--;
      this.gunTimers[i] = this.burstLeft[i] > 0 ? gun.burstGap : gun.interval;
    }
  }

  /** Direction to the player's predicted position. */
  private aimDirection(gun: GunTuning, out: Vector3): Vector3 {
    const p = this.world.player;
    const dist = p.position.distanceTo(this.position);
    const lead = gun.kind === 'laser' ? (dist / gun.speed) * this.tuning.lead : 0;
    return out.copy(p.position).addScaledVector(p.velocity, lead).sub(this.position).normalize();
  }

  private fire(gun: GunTuning, aim: Vector3): void {
    const level = this.world.level;
    // Shots leave from the nose but go where the robot is aiming, within
    // its fire cone: it has to turn toward the player first.
    const muzzle = _origin.copy(this.position).addScaledVector(this.forward, this.radius * 0.9);
    const seg = level.findSegment(muzzle, this.segment);
    if (seg < 0) return;
    const dir = aim.clone();
    if (gun.spread > 0) {
      dir.x += (this.world.rng() - 0.5) * 2 * gun.spread;
      dir.y += (this.world.rng() - 0.5) * 2 * gun.spread;
      dir.z += (this.world.rng() - 0.5) * 2 * gun.spread;
      dir.normalize();
    }
    this.world.projectiles.spawn(gun.kind, 'enemy', muzzle, dir, seg, { speed: gun.speed, damageScale: gun.damageScale });
    this.world.effects.muzzleFlash(muzzle, this.tuning.color);
    this.world.effects.sound(gun.kind === 'laser' ? 'enemyLaser' : 'enemyMissile', muzzle);
  }

  private checkRam(): void {
    const p = this.world.player;
    const ram = this.tuning.ram!;
    if (!p.alive) return;
    if (p.position.distanceTo(this.position) < this.radius + p.radius + ram.trigger) this.die(true);
  }

  private die(rammed: boolean): void {
    this.alive = false;
    const t = this.tuning;
    if (t.ram) {
      // Mines blow up either way; a shot-down one is weaker.
      const scale = rammed ? 1 : 0.6;
      this.world.projectiles.explode(
        this.position, 'enemy', t.ram.damage * scale, t.ram.radius, t.deathSize, t.color, this.segment,
      );
    } else {
      this.world.effects.explosion(this.position, t.deathSize, t.color);
    }
    this.world.onDeath(this);
  }

  // ------------------------------------------------------------------ movement

  private move(dt: number): void {
    const t = this.tuning;
    const level = this.world.level;

    // Face the player while fighting, otherwise the direction of travel.
    if (this.state === 'attack' && this.canSee) this.face(this.aimDirection(t.guns[0] ?? RAM_AIM, _w).clone(), dt);
    else if (this.state !== 'patrol') this.face(null, dt);

    // Accelerate toward the desired velocity.
    const dv = _v.subVectors(_desired, this.velocity);
    const maxDv = t.accel * dt;
    if (dv.lengthSq() > maxDv * maxDv) dv.setLength(maxDv);
    this.velocity.add(dv);
    // Gentle hover bob so idle robots look alive.
    this.velocity.y += Math.sin(this.time * 1.7) * 0.4 * dt;

    this.prevPosition.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.separate();
    collideSphere(level, this.segment, this.position, this.velocity, this.radius, 0.3);
    const seg = level.findSegment(this.position, this.segment);
    if (seg < 0) {
      this.position.copy(this.prevPosition);
      this.velocity.set(0, 0, 0);
    } else {
      this.segment = seg;
    }
  }

  /** Keeps robots from overlapping each other and the player. */
  private separate(): void {
    for (const r of this.world.robots) {
      if (r === this || !r.alive) continue;
      pushApart(this.position, this.velocity, this.radius, r.position, r.radius, 0.5);
    }
    const p = this.world.player;
    if (p.alive) pushApart(this.position, this.velocity, this.radius, p.position, p.radius, 1);
  }

  /** Turns toward `dir` (or the direction of travel) at the robot's turn rate. */
  private face(dir: Vector3 | null, dt: number): void {
    let look = dir;
    if (!look) {
      if (this.velocity.lengthSq() < 1) return;
      look = _w.copy(this.velocity).normalize();
    }
    const up = Math.abs(look.y) < 0.95 ? WORLD_UP : _v.set(0, 1, 0).applyQuaternion(this.quaternion);
    _m.lookAt(_origin.set(0, 0, 0), look, up);
    _q.setFromRotationMatrix(_m);
    this.quaternion.rotateTowards(_q, this.tuning.turnRate * dt);
  }

  // ------------------------------------------------------------------- visuals

  private updateVisuals(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    const m = this.mesh;
    m.object.quaternion.copy(this.quaternion);
    for (const s of m.spin ?? []) s.object.rotateOnAxis(s.axis, s.speed * dt);
    let pulse = 1;
    if (this.tuning.ram) {
      // Mines spin and pulse faster as they close in.
      m.object.rotateY(dt * 2);
      const d = this.world.player.position.distanceTo(this.position);
      const rate = this.state === 'patrol' ? 2 : 4 + 20 * Math.max(0, 1 - d / 15);
      pulse = 0.55 + 0.45 * Math.sin(this.time * rate);
    } else if (this.state !== 'patrol') {
      pulse = 1.2;
    }
    for (const g of m.glows) {
      if (this.flash > 0) g.material.color.copy(WHITE);
      else g.material.color.copy(g.base).multiplyScalar(g === m.eye ? pulse : 1);
    }
  }
}

/** Placeholder aim spec for robots without guns (kamikazes). */
const RAM_AIM: GunTuning = { kind: 'laser', interval: 0, burst: 0, burstGap: 0, speed: 1e9, damageScale: 0, spread: 0 };

function randomPerpendicular(axis: Vector3, out: Vector3, rng: () => number): Vector3 {
  out.set(rng() - 0.5, rng() - 0.5, rng() - 0.5);
  out.addScaledVector(axis, -out.dot(axis));
  if (out.lengthSq() < 1e-6) out.set(axis.y, -axis.x, 0);
  return out.normalize();
}

/** Moves `pos` out of the other sphere by `share` of the overlap. */
function pushApart(pos: Vector3, vel: Vector3, r: number, other: Vector3, otherR: number, share: number): void {
  const d = _v.subVectors(pos, other);
  const dist = d.length();
  const overlap = r + otherR - dist;
  if (overlap <= 0) return;
  if (dist < 1e-6) d.set(0, 1, 0);
  else d.multiplyScalar(1 / dist);
  pos.addScaledVector(d, overlap * share);
  const vn = vel.dot(d);
  if (vn < 0) vel.addScaledVector(d, -vn);
}
