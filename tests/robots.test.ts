import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectileSystem, WEAPON_TUNING } from '../src/combat/Projectiles';
import { NO_EFFECTS, type Damageable } from '../src/combat/types';
import { Robot, type RobotWorld } from '../src/entities/robots/Robot';
import { ROBOT_TUNING } from '../src/entities/robots/tuning';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { buildLevel01 } from '../src/level/levels/level01';
import type { RobotType } from '../src/level/types';
import { distanceToTris } from '../src/physics/Collision';

/** Long tunnel along +z: four 8×8×12 boxes, door between the 2nd and 3rd, plus a side room off the first. */
function tunnel() {
  const b = new LevelBuilder();
  const a = b.addBox([0, 0, 0], [8, 8, 12], 0);
  const s1 = b.extrude(a, SIDE.FRONT, { length: 12 });
  const s2 = b.extrude(s1, SIDE.FRONT, { length: 12 });
  const s3 = b.extrude(s2, SIDE.FRONT, { length: 12 });
  const side = b.extrude(a, SIDE.RIGHT, { length: 10 });
  b.door(s1, SIDE.FRONT);
  return { level: new Level(b.build('t', a, [0, 0, 1])), a, s1, s2, s3, side };
}

/** Minimal stand-in for the player. */
class Quarry implements Damageable {
  readonly faction = 'player' as const;
  readonly radius = 0.9;
  readonly velocity = new Vector3();
  alive = true;
  shield = 100;
  constructor(readonly position: Vector3, public segment: number) {}
  damage(amount: number): void {
    this.shield -= amount;
  }
}

/** Deterministic PRNG so behaviour is reproducible. */
function rng(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function setup(level: Level, player: Quarry) {
  const robots: Robot[] = [];
  const deaths: Robot[] = [];
  const damageables: Damageable[] = [player];
  const projectiles = new ProjectileSystem(level, NO_EFFECTS, () => damageables);
  const world: RobotWorld = {
    level, projectiles, effects: NO_EFFECTS, player, robots, rng: rng(), onDeath: (r) => deaths.push(r),
  };
  const add = (type: RobotType, seg: number, pos: Vector3) => {
    const r = new Robot(type, { type, segment: seg, position: [pos.x, pos.y, pos.z] }, world);
    robots.push(r);
    damageables.push(r);
    return r;
  };
  const run = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += 1 / 120) {
      for (const r of robots) r.update(1 / 120);
      projectiles.update(1 / 120);
      if (until?.()) return true;
    }
    return false;
  };
  return { add, run, projectiles, deaths };
}

describe('Level.findPath', () => {
  it('finds the portal path and respects closed doors', () => {
    const { level, a, s1, s2, s3, side } = tunnel();
    const passable = (seg: number, s: number) => !level.doorAt(seg, s)?.solid;
    expect(level.findPath(side, s1)).toEqual([side, a, s1]);
    expect(level.findPath(a, s3, passable)).toBeNull();
    level.doors[0].solid = false;
    expect(level.findPath(a, s3, passable)).toEqual([a, s1, s2, s3]);
    expect(level.findPath(s2, s2)).toEqual([s2]);
  });
});

describe('level01 robots', () => {
  it('start inside their segments, clear of the walls', () => {
    const level = new Level(buildLevel01());
    expect(level.data.robots.length).toBeGreaterThanOrEqual(8);
    for (const r of level.data.robots) {
      const p = new Vector3(...r.position);
      expect(level.findSegment(p, r.segment)).toBe(r.segment);
      expect(distanceToTris(p, level.nearWalls(r.segment))).toBeGreaterThan(ROBOT_TUNING[r.type].radius);
    }
  });
});

describe('Robot AI', () => {
  it('notices a visible player and opens fire', () => {
    const { level, a, s1 } = tunnel();
    const player = new Quarry(new Vector3(0, 0, 14), s1);
    const { add, run } = setup(level, player);
    const robot = add('stinger', a, new Vector3(0, 0, -2));
    run(1);
    expect(robot.state === 'attack' || robot.state === 'chase').toBe(true);
    // Shots have some spread, so allow a few misses before the first hit.
    expect(run(10, () => player.shield < 100)).toBe(true);
  });

  it('does not see through a closed door', () => {
    const { level, a, s2 } = tunnel();
    const player = new Quarry(new Vector3(0, 0, 26), s2);
    const { add, run } = setup(level, player);
    const robot = add('stinger', a, new Vector3(0, 0, 4));
    run(3);
    expect(robot.state).toBe('patrol');
    expect(player.shield).toBe(100);
  });

  it('chases through portals to where the player was last seen', () => {
    const { level, a, side } = tunnel();
    const player = new Quarry(new Vector3(9, 0, 0), side);
    const { add, run } = setup(level, player);
    const robot = add('bulwark', a, new Vector3(-2, 0, 10)); // starts in the first box's far corner
    robot.alert(player.position, player.segment, false);
    // The player vanishes; the robot should still go and look.
    player.alive = false;
    expect(run(10, () => robot.segment === side)).toBe(true);
  });

  it('a fuse rams the player and detonates', () => {
    const { level, a, s1 } = tunnel();
    const player = new Quarry(new Vector3(0, 0, 14), s1);
    const { add, run, deaths } = setup(level, player);
    const fuse = add('fuse', a, new Vector3(0, 0, 0));
    expect(run(4, () => !fuse.alive)).toBe(true);
    expect(deaths).toContain(fuse);
    expect(player.shield).toBeLessThan(100 - ROBOT_TUNING.fuse.ram!.damage * 0.5);
  });

  it('a damaged stinger flees, then comes back', () => {
    const { level, a, s1 } = tunnel();
    const player = new Quarry(new Vector3(0, 0, 14), s1);
    const { add, run } = setup(level, player);
    const robot = add('stinger', a, new Vector3(0, 0, 0));
    run(1);
    robot.damage(ROBOT_TUNING.stinger.hp * 0.7, robot.position.clone());
    run(0.1);
    expect(robot.state).toBe('flee');
    run(5);
    expect(robot.state).not.toBe('flee');
    expect(robot.alive).toBe(true);
  });

  it('enemy shots use their damage scale', () => {
    const { level, a, s1 } = tunnel();
    const player = new Quarry(new Vector3(0, 0, 14), s1);
    const { projectiles } = setup(level, player);
    projectiles.spawn('laser', 'enemy', new Vector3(0, 0, 0), new Vector3(0, 0, 1), a, { speed: 50, damageScale: 0.5 });
    for (let t = 0; t < 1; t += 1 / 120) projectiles.update(1 / 120);
    expect(player.shield).toBe(100 - WEAPON_TUNING.laser.damage * 0.5);
  });
});
