import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectileSystem } from '../src/combat/Projectiles';
import { NO_EFFECTS, type Damageable } from '../src/combat/types';
import { Door } from '../src/entities/Door';
import { Reactor, REACTOR_TUNING } from '../src/entities/Reactor';
import { MISSION_TUNING, Objective } from '../src/game/Objective';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { validateLevel } from '../src/level/LevelLoader';
import { buildLevel01 } from '../src/level/levels/level01';

describe('Objective', () => {
  it('reactor → escape → exit wins', () => {
    const o = new Objective(30);
    o.reachedExit();
    expect(o.state).toBe('active');
    o.reactorDestroyed();
    expect(o.state).toBe('escape');
    o.update(10);
    expect(o.timeLeft).toBeCloseTo(20);
    o.reachedExit();
    expect(o.state).toBe('won');
    expect(o.over).toBe(true);
  });

  it('the countdown running out loses', () => {
    const o = new Objective(5);
    o.reactorDestroyed();
    o.update(6);
    expect(o.state).toBe('lost');
    expect(o.lossReason).toBe('collapse');
  });

  it('ships run out, and dying during the escape is fatal', () => {
    const o = new Objective(30);
    for (let i = 1; i < MISSION_TUNING.ships; i++) expect(o.playerDied()).toBe(true);
    expect(o.playerDied()).toBe(false);
    expect(o.lossReason).toBe('out-of-ships');

    const e = new Objective(30);
    e.reactorDestroyed();
    expect(e.playerDied()).toBe(false);
    expect(e.lossReason).toBe('caught');
  });
});

/** A reactor room with the player at the far end of a corridor. */
function reactorLevel() {
  const b = new LevelBuilder();
  const room = b.addBox([0, 0, 0], [16, 16, 16], 0);
  const hall = b.extrude(room, SIDE.FRONT, { length: 20 });
  const out = b.extrude(room, SIDE.BACK, { length: 6 });
  b.exit(room, SIDE.BACK);
  b.reactor(room, [0, 0, 0], [[5, 0, 0], [-5, 0, 0]], 20);
  return { data: b.build('r', hall, [0, 0, -1]), room, hall, out };
}

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

function setup() {
  const { data, hall } = reactorLevel();
  const level = new Level(data);
  const player = new Quarry(new Vector3(0, 0, 20), hall);
  const damageables: Damageable[] = [player];
  const projectiles = new ProjectileSystem(level, NO_EFFECTS, () => damageables);
  const reactor = new Reactor(data.reactor!, level, projectiles, NO_EFFECTS, player, () => 0.5);
  damageables.push(...reactor.damageables);
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 120) { reactor.update(1 / 120); projectiles.update(1 / 120); }
  };
  return { level, player, reactor, projectiles, run, data };
}

describe('Reactor', () => {
  it('validates as level data with an exit door', () => {
    expect(validateLevel(reactorLevel().data)).toEqual([]);
    expect(validateLevel(buildLevel01())).toEqual([]);
  });

  it('the exit door stays sealed until unlocked', () => {
    const { level } = setup();
    const state = level.doors.find((d) => d.exit)!;
    const door = new Door(state);
    const atDoor = state.center.clone().addScaledVector(state.normal, 2);
    expect(door.update(1 / 60, atDoor, 0.9, false)).toBe('locked');
    for (let i = 0; i < 60; i++) door.update(1 / 60, atDoor, 0.9, false);
    expect(state.openAmount).toBe(0);
    expect(door.update(1 / 60, atDoor, 0.9, true)).toBe('opened');
  });

  it('is shielded until every pylon is destroyed', () => {
    const { reactor } = setup();
    reactor.damage(100, reactor.position.clone());
    expect(reactor.hp).toBe(REACTOR_TUNING.hp);
    expect(reactor.events).toContain('shield-hit');
    for (const p of reactor.pylons) p.damage(REACTOR_TUNING.pylonHp, p.position.clone());
    expect(reactor.shielded).toBe(false);
    expect(reactor.events.filter((e) => e === 'pylon-destroyed')).toHaveLength(2);
    expect(reactor.events).toContain('shield-down');
    reactor.damage(100, reactor.position.clone());
    expect(reactor.hp).toBe(REACTOR_TUNING.hp - 100);
  });

  it('blows up after its death sequence', () => {
    const { reactor, run } = setup();
    for (const p of reactor.pylons) p.damage(1000, p.position.clone());
    reactor.damage(1000, reactor.position.clone());
    expect(reactor.alive).toBe(false);
    expect(reactor.destroyed).toBe(false);
    run(REACTOR_TUNING.deathTime + 0.1);
    expect(reactor.destroyed).toBe(true);
    expect(reactor.events.at(-1)).toBe('destroyed');
  });

  it('fires volleys at a player in sight', () => {
    const { reactor, player, run } = setup();
    run(6);
    expect(player.shield).toBeLessThan(100);
    expect(reactor.alive).toBe(true);
  });
});
