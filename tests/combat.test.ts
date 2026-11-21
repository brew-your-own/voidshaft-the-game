import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerWeapons, GUN_TUNING } from '../src/combat/PlayerWeapons';
import { ProjectileSystem, WEAPON_TUNING } from '../src/combat/Projectiles';
import { segmentSphere, segmentTriangle, sweepWalls } from '../src/combat/raycast';
import { NO_EFFECTS, type Damageable, type Faction } from '../src/combat/types';
import { Player, PLAYER_LIMITS } from '../src/game/Player';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { Ship } from '../src/physics/Ship';

/** Long tunnel along +z: four 6×6×10 boxes, door between the 2nd and 3rd. */
function tunnel() {
  const b = new LevelBuilder();
  const a = b.addBox([0, 0, 0], [6, 6, 10], 0);
  const s1 = b.extrude(a, SIDE.FRONT, { length: 10 });
  const s2 = b.extrude(s1, SIDE.FRONT, { length: 10 });
  const s3 = b.extrude(s2, SIDE.FRONT, { length: 10 });
  b.door(s1, SIDE.FRONT);
  return { level: new Level(b.build('t', a, [0, 0, 1])), a, s1, s2, s3 };
}

class Dummy implements Damageable {
  alive = true;
  hp = 100;
  readonly radius = 1;
  constructor(readonly position: Vector3, public segment: number, readonly faction: Faction = 'enemy') {}
  damage(amount: number): void {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }
}

function runFor(system: ProjectileSystem, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 120) system.update(1 / 120);
}

describe('raycast helpers', () => {
  it('segment/triangle and segment/sphere', () => {
    const tri = { a: new Vector3(-1, -1, 0), b: new Vector3(1, -1, 0), c: new Vector3(0, 1, 0), n: new Vector3(0, 0, 1), d: 0 };
    expect(segmentTriangle(new Vector3(0, 0, 1), new Vector3(0, 0, -1), tri)).toBeCloseTo(0.5);
    expect(segmentTriangle(new Vector3(5, 0, 1), new Vector3(5, 0, -1), tri)).toBe(-1);
    expect(segmentSphere(new Vector3(0, 0, -5), new Vector3(0, 0, 5), new Vector3(0, 0, 0), 1)).toBeCloseTo(0.4);
    expect(segmentSphere(new Vector3(3, 0, -5), new Vector3(3, 0, 5), new Vector3(0, 0, 0), 1)).toBe(-1);
  });

  it('sweeps hit the end wall but pass through open portals', () => {
    const { level, a } = tunnel();
    level.doors[0].solid = false;
    expect(sweepWalls(level, a, new Vector3(0, 0, 0), new Vector3(0, 0, 8))).toBeNull();
    const hit = sweepWalls(level, a, new Vector3(0, 0, 0), new Vector3(0, 0, -10));
    expect(hit?.t).toBeCloseTo(0.5);
  });

  it('line of sight is blocked by a closed door only', () => {
    const { level, a } = tunnel();
    const from = new Vector3(0, 0, 0), to = new Vector3(0, 0, 30);
    expect(level.lineOfSight(from, a, to)).toBe(false);
    level.doors[0].solid = false;
    expect(level.lineOfSight(from, a, to)).toBe(true);
  });
});

describe('ProjectileSystem', () => {
  it('a laser damages an enemy in its path and is consumed', () => {
    const { level, a, s1 } = tunnel();
    const enemy = new Dummy(new Vector3(0, 0, 10), s1);
    const sys = new ProjectileSystem(level, NO_EFFECTS, () => [enemy]);
    sys.spawn('laser', 'player', new Vector3(0, 0, 0), new Vector3(0, 0, 1), a);
    runFor(sys, 0.5);
    expect(enemy.hp).toBe(100 - WEAPON_TUNING.laser.damage);
    expect(sys.projectiles).toHaveLength(0);
  });

  it('lasers ignore their own faction and stop at closed doors', () => {
    const { level, a, s2 } = tunnel();
    const friend = new Dummy(new Vector3(0, 0, 4), a, 'player');
    const behindDoor = new Dummy(new Vector3(0, 0, 22), s2);
    const sys = new ProjectileSystem(level, NO_EFFECTS, () => [friend, behindDoor]);
    sys.spawn('laser', 'player', new Vector3(0, 0, 0), new Vector3(0, 0, 1), a);
    runFor(sys, 1);
    expect(friend.hp).toBe(100);
    expect(behindDoor.hp).toBe(100);
    expect(sys.projectiles).toHaveLength(0);
  });

  it('a missile homes onto an off-axis target and splashes', () => {
    const { level, a, s1 } = tunnel();
    const enemy = new Dummy(new Vector3(2, 1.5, 12), s1);
    const sys = new ProjectileSystem(level, NO_EFFECTS, () => [enemy]);
    sys.spawn('missile', 'player', new Vector3(0, 0, 0), new Vector3(0, 0, 1), a);
    runFor(sys, 1.5);
    const m = WEAPON_TUNING.missile;
    // Direct hit plus splash; the proximity fuse detonates slightly outside
    // the hull, so splash is a little below its maximum.
    const fuseFalloff = 1 - m.proximityFuse / m.splashRadius;
    expect(enemy.hp).toBeLessThanOrEqual(100 - m.damage - m.splashDamage * fuseFalloff + 0.01);
  });
});

describe('Player and weapons', () => {
  function rig() {
    const { level } = tunnel();
    const player = new Player(new Ship(level));
    const sys = new ProjectileSystem(level, NO_EFFECTS, () => [player]);
    return { player, sys, weapons: new PlayerWeapons(player, level, sys, NO_EFFECTS) };
  }

  it('lasers fire in pairs, cost energy and respect the cooldown', () => {
    const { player, sys, weapons } = rig();
    weapons.update(1 / 120, true, false);
    expect(sys.projectiles).toHaveLength(2);
    expect(player.energy).toBe(PLAYER_LIMITS.energy - GUN_TUNING.laserEnergy);
    weapons.update(1 / 120, true, false);
    expect(sys.projectiles).toHaveLength(2);
  });

  it('missiles use ammo and report when empty', () => {
    const { player, weapons } = rig();
    player.missiles = 1;
    expect(weapons.update(1 / 120, false, true)).toBeNull();
    expect(player.missiles).toBe(0);
    expect(weapons.update(1, false, true)).toBe('no-missiles');
  });

  it('pickups are only consumed when useful', () => {
    const { player } = rig();
    expect(player.collect('shield')).toBe(false);
    player.damage(40);
    expect(player.collect('shield')).toBe(true);
    expect(player.shield).toBe(85);
    player.damage(1000);
    expect(player.alive).toBe(false);
    player.respawn();
    expect(player.alive).toBe(true);
    expect(player.shield).toBe(PLAYER_LIMITS.shield);
  });
});
