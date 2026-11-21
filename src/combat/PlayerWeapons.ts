import { Vector3 } from 'three';
import type { Player } from '../game/Player';
import type { Level } from '../level/Level';
import { PROJECTILE_COLORS, type ProjectileSystem } from './Projectiles';
import type { Effects } from './types';

export const GUN_TUNING = {
  laserCooldown: 0.2,
  laserEnergy: 0.5, // per volley of two bolts
  missileCooldown: 0.65,
  /** Gun mounts in ship space (ship looks down -Z). */
  laserMounts: [new Vector3(-0.55, -0.25, -0.5), new Vector3(0.55, -0.25, -0.5)],
  missileMounts: [new Vector3(-0.3, -0.4, -0.4), new Vector3(0.3, -0.4, -0.4)],
};

export type WeaponEvent = 'no-energy' | 'no-missiles' | null;

const _pos = new Vector3();
const _dir = new Vector3();

/** Primary laser (energy) and secondary homing missiles (ammo). */
export class PlayerWeapons {
  private laserTimer = 0;
  private missileTimer = 0;
  private missileSide = 0;

  constructor(
    private readonly player: Player,
    private readonly level: Level,
    private readonly projectiles: ProjectileSystem,
    private readonly effects: Effects,
  ) {}

  update(dt: number, primary: boolean, secondary: boolean): WeaponEvent {
    this.laserTimer = Math.max(0, this.laserTimer - dt);
    this.missileTimer = Math.max(0, this.missileTimer - dt);
    if (!this.player.alive) return null;
    let event: WeaponEvent = null;

    if (primary && this.laserTimer === 0) {
      if (this.player.energy >= GUN_TUNING.laserEnergy) {
        this.player.energy -= GUN_TUNING.laserEnergy;
        this.laserTimer = GUN_TUNING.laserCooldown;
        for (const mount of GUN_TUNING.laserMounts) this.fire('laser', mount);
      } else {
        event = 'no-energy';
        this.laserTimer = 0.5;
      }
    }

    if (secondary && this.missileTimer === 0) {
      if (this.player.missiles > 0) {
        this.player.missiles--;
        this.missileTimer = GUN_TUNING.missileCooldown;
        this.fire('missile', GUN_TUNING.missileMounts[this.missileSide]);
        this.missileSide = 1 - this.missileSide;
      } else {
        event = 'no-missiles';
        this.missileTimer = 0.5;
      }
    }
    return event;
  }

  private fire(kind: 'laser' | 'missile', mount: Vector3): void {
    const ship = this.player.ship;
    _pos.copy(mount).applyQuaternion(ship.quaternion).add(ship.position);
    _dir.set(0, 0, -1).applyQuaternion(ship.quaternion);
    const seg = this.level.findSegment(_pos, ship.segment);
    if (seg < 0) return;
    this.projectiles.spawn(kind, 'player', _pos, _dir, seg);
    this.effects.muzzleFlash(_pos, PROJECTILE_COLORS.player);
  }
}
