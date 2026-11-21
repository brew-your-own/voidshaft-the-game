import {
  AdditiveBlending, Color, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, PointLight, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { ProjectileSystem } from '../combat/Projectiles';
import type { Damageable, Effects } from '../combat/types';
import type { Level } from '../level/Level';
import type { ReactorData } from '../level/types';
import { PALETTE } from '../render/palette';
import type { RobotQuarry } from './robots/Robot';

export const REACTOR_TUNING = {
  hp: 600,
  radius: 2.2,
  shieldRadius: 2.8,
  pylonHp: 80,
  pylonRadius: 0.9,
  range: 45,
  volley: { interval: 2.6, enragedInterval: 1.5, shots: 5, spread: 0.12, speed: 45, damageScale: 0.5 },
  /** Homing missiles once the shield is down. */
  missile: { interval: 7, speed: 24, damageScale: 0.4 },
  /** Seconds of chain explosions before the core goes. */
  deathTime: 1.6,
};

export type ReactorEvent = 'shield-hit' | 'pylon-destroyed' | 'shield-down' | 'core-critical' | 'destroyed';

const UP = new Vector3(0, 1, 0);
const WHITE = new Color(4, 4, 4);
const _v = new Vector3();

/** Shield emitter. The reactor is invulnerable while any pylon stands. */
class Pylon implements Damageable {
  readonly faction = 'enemy' as const;
  readonly radius = REACTOR_TUNING.pylonRadius;
  readonly position: Vector3;
  readonly object = new Group();
  alive = true;
  hp = REACTOR_TUNING.pylonHp;
  flash = 0;
  private readonly led: MeshBasicMaterial;
  private readonly ledColor = new Color(PALETTE.cyan).multiplyScalar(3);

  constructor(position: Vector3, public segment: number, core: Vector3, private readonly owner: Reactor) {
    this.position = position.clone();
    this.led = new MeshBasicMaterial({ color: this.ledColor.clone(), toneMapped: false });
    const body = new Mesh(
      new OctahedronGeometry(0.7, 0),
      new MeshStandardMaterial({ color: 0x252a3a, flatShading: true, metalness: 0.8, roughness: 0.3 }),
    );
    body.scale.set(0.8, 1.3, 0.8);
    const ring = new Mesh(new TorusGeometry(0.75, 0.05, 4, 4), this.led);
    ring.rotation.x = Math.PI / 2;
    this.object.add(body, ring);
    this.object.position.copy(this.position);

    // Energy beam feeding the core.
    const to = _v.subVectors(core, this.position);
    const len = to.length() - REACTOR_TUNING.shieldRadius;
    const beam = new Mesh(new CylinderGeometry(0.05, 0.05, len, 4, 1, true), this.led);
    beam.quaternion.setFromUnitVectors(UP, to.normalize());
    beam.position.copy(to).multiplyScalar(len / 2);
    this.object.add(beam);
  }

  damage(amount: number, hitPoint: Vector3): void {
    if (!this.alive || amount <= 0) return;
    this.hp -= amount;
    this.flash = 0.12;
    this.owner.onPylonHit(this, hitPoint);
  }

  update(dt: number, time: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.object.rotation.y = time * 1.5;
    this.led.color.copy(this.flash > 0 ? WHITE : this.ledColor);
  }
}

/** The level boss: a shielded core that fires volleys at the player. */
export class Reactor implements Damageable {
  readonly faction = 'enemy' as const;
  readonly radius = REACTOR_TUNING.radius;
  readonly position: Vector3;
  readonly segment: number;
  readonly object = new Group();
  readonly pylons: Pylon[];
  readonly events: ReactorEvent[] = [];
  readonly countdown: number;
  alive = true;
  hp = REACTOR_TUNING.hp;
  /** Set once the core has finished exploding. */
  destroyed = false;
  private dying = -1;
  private time = 0;
  private flash = 0;
  private shieldFlash = 0;
  private volleyTimer = 1.5;
  private missileTimer = REACTOR_TUNING.missile.interval;
  private readonly core: MeshBasicMaterial;
  private readonly coreColor = new Color(0xff5a2a).multiplyScalar(3);
  private readonly shield: Mesh;
  private readonly shieldMat: MeshBasicMaterial;
  private readonly rings: Mesh[] = [];
  private readonly light: PointLight;

  constructor(
    data: ReactorData,
    private readonly level: Level,
    private readonly projectiles: ProjectileSystem,
    private readonly effects: Effects,
    private readonly player: RobotQuarry,
    private readonly rng: () => number = Math.random,
  ) {
    this.position = new Vector3(...data.position);
    this.segment = data.segment;
    this.countdown = data.countdown;
    this.object.position.copy(this.position);

    this.core = new MeshBasicMaterial({ color: this.coreColor.clone(), toneMapped: false });
    const hot = new Mesh(new IcosahedronGeometry(1.3, 1), this.core);
    // Armour plates: a dodecahedral shell with gaps showing the hot core.
    const shell = new Group();
    const plateGeo = new CylinderGeometry(0.75, 0.9, 0.25, 5);
    const plateMat = new MeshStandardMaterial({ color: 0x23283a, flatShading: true, metalness: 0.8, roughness: 0.35 });
    const dirs = new IcosahedronGeometry(1, 0).getAttribute('position');
    const seen: Vector3[] = [];
    for (let i = 0; i < dirs.count; i++) {
      const d = new Vector3().fromBufferAttribute(dirs, i).normalize();
      if (seen.some((s) => s.distanceToSquared(d) < 1e-4)) continue;
      seen.push(d);
      const plate = new Mesh(plateGeo, plateMat);
      plate.quaternion.setFromUnitVectors(UP, d);
      plate.position.copy(d).multiplyScalar(1.55);
      shell.add(plate);
    }
    this.object.add(hot, shell);
    for (const [i, color] of [PALETTE.red, PALETTE.amber].entries()) {
      const ring = new Mesh(
        new TorusGeometry(2.25 + i * 0.25, 0.06, 4, 32),
        new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.5), toneMapped: false }),
      );
      ring.rotation.x = i ? Math.PI / 3 : -Math.PI / 4;
      this.rings.push(ring);
      this.object.add(ring);
    }
    this.shieldMat = new MeshBasicMaterial({
      color: new Color(PALETTE.cyan), transparent: true, opacity: 0.1,
      blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.shield = new Mesh(new SphereGeometry(REACTOR_TUNING.shieldRadius, 24, 16), this.shieldMat);
    this.object.add(this.shield);
    this.light = new PointLight(0xff6a30, 3, 30, 1.4);
    this.object.add(this.light);

    this.pylons = data.pylons.map((p) => new Pylon(new Vector3(...p.position), p.segment, this.position, this));
  }

  /** Everything projectiles can hit: the core and its pylons. */
  get damageables(): Damageable[] {
    return [this, ...this.pylons];
  }

  get shielded(): boolean {
    return this.pylons.some((p) => p.alive);
  }

  damage(amount: number, hitPoint: Vector3): void {
    if (!this.alive || amount <= 0) return;
    if (this.shielded) {
      this.shieldFlash = 0.25;
      this.effects.sound('shieldHit', hitPoint);
      this.events.push('shield-hit');
      return;
    }
    this.hp -= amount;
    this.flash = 0.12;
    this.effects.impact(hitPoint, _v.subVectors(hitPoint, this.position).normalize(), 0xffffff);
    if (this.hp <= 0) {
      this.alive = false;
      this.dying = 0;
      this.events.push('core-critical');
    }
  }

  /** Called by a pylon when it takes damage. */
  onPylonHit(pylon: Pylon, hitPoint: Vector3): void {
    if (pylon.hp > 0) {
      this.effects.impact(hitPoint, _v.subVectors(hitPoint, pylon.position).normalize(), 0xffffff);
      return;
    }
    pylon.alive = false;
    this.effects.explosion(pylon.position, 1.1, PALETTE.cyan);
    pylon.object.removeFromParent();
    this.events.push('pylon-destroyed');
    if (!this.shielded) {
      this.shield.visible = false;
      this.events.push('shield-down');
    }
  }

  update(dt: number): void {
    if (this.destroyed) return;
    this.time += dt;
    for (const p of this.pylons) if (p.alive) p.update(dt, this.time);
    if (this.dying >= 0) {
      this.updateDeath(dt);
      return;
    }
    this.updateWeapons(dt);
    this.updateVisuals(dt);
  }

  private updateWeapons(dt: number): void {
    const t = REACTOR_TUNING;
    const p = this.player;
    this.volleyTimer -= dt;
    this.missileTimer -= dt;
    if (!p.alive || p.position.distanceTo(this.position) > t.range) return;
    if (this.volleyTimer > 0 && (this.shielded || this.missileTimer > 0)) return;
    if (!this.level.lineOfSight(this.position, this.segment, p.position)) return;
    const aim = _v.subVectors(p.position, this.position).normalize();
    const muzzle = this.position.clone().addScaledVector(aim, t.shieldRadius + 0.3);
    const seg = this.level.findSegment(muzzle, this.segment);
    if (seg < 0) return;
    if (this.volleyTimer <= 0) {
      this.volleyTimer = this.shielded ? t.volley.interval : t.volley.enragedInterval;
      for (let i = 0; i < t.volley.shots; i++) {
        const dir = aim.clone();
        if (i > 0) {
          dir.x += (this.rng() - 0.5) * 2 * t.volley.spread;
          dir.y += (this.rng() - 0.5) * 2 * t.volley.spread;
          dir.z += (this.rng() - 0.5) * 2 * t.volley.spread;
        }
        this.projectiles.spawn('laser', 'enemy', muzzle, dir, seg, { speed: t.volley.speed, damageScale: t.volley.damageScale });
      }
      this.effects.muzzleFlash(muzzle, PALETTE.red);
      this.effects.sound('enemyLaser', muzzle);
    }
    if (!this.shielded && this.missileTimer <= 0) {
      this.missileTimer = t.missile.interval;
      this.projectiles.spawn('missile', 'enemy', muzzle, aim, seg, { speed: t.missile.speed, damageScale: t.missile.damageScale });
      this.effects.sound('enemyMissile', muzzle);
    }
  }

  private updateVisuals(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);
    const damaged = 1 - this.hp / REACTOR_TUNING.hp;
    const rate = 2 + damaged * 8;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * rate);
    this.core.color.copy(this.flash > 0 ? WHITE : this.coreColor).multiplyScalar(this.flash > 0 ? 1 : pulse);
    this.light.intensity = 2.5 * pulse;
    this.rings[0].rotation.z += dt * (0.6 + damaged * 2);
    this.rings[1].rotation.y += dt * (0.9 + damaged * 2);
    this.shieldMat.opacity = 0.08 + 0.04 * Math.sin(this.time * 3) + this.shieldFlash * 1.6;
  }

  private updateDeath(dt: number): void {
    const t = REACTOR_TUNING;
    const before = Math.floor(this.dying / 0.15);
    this.dying += dt;
    if (Math.floor(this.dying / 0.15) > before) {
      _v.set(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize().multiplyScalar(t.radius * this.rng());
      this.effects.explosion(_v.add(this.position), 0.8 + this.rng() * 0.6, this.rng() < 0.5 ? PALETTE.amber : PALETTE.red);
    }
    this.core.color.copy(WHITE).multiplyScalar(0.5 + this.rng());
    this.rings[0].rotation.z += dt * 8;
    this.rings[1].rotation.y += dt * 9;
    if (this.dying >= t.deathTime) {
      this.destroyed = true;
      this.effects.explosion(this.position, 3.2, PALETTE.amber);
      this.object.removeFromParent();
      this.events.push('destroyed');
    }
  }
}
