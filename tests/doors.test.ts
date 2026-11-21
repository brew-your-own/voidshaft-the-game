import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Door, DOOR_TUNING } from '../src/entities/Door';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { validateLevel } from '../src/level/LevelLoader';
import { LEVEL_SOURCES } from '../src/level/levels';
import { collideSphere } from '../src/physics/Collision';
import { PortalCuller } from '../src/render/PortalCuller';

/** Three boxes in a row along +z with a door between the first two. */
function corridor(key: 'red' | null = null) {
  const b = new LevelBuilder();
  const a = b.addBox([0, 0, 0], [4, 4, 4], 0xffffff);
  const m = b.extrude(a, SIDE.FRONT, { length: 4 });
  const c = b.extrude(m, SIDE.FRONT, { length: 4 });
  b.door(a, SIDE.FRONT, key);
  return { level: new Level(b.build('t', a, [0, 0, 1])), a, m, c };
}

function run(door: Door, seconds: number, pos: Vector3, hasKey = false) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 120) {
    const e = door.update(1 / 120, pos, 0.9, hasKey);
    if (e) events.push(e);
  }
  return events;
}

describe('exported levels', () => {
  for (const [id, build] of Object.entries(LEVEL_SOURCES)) {
    it(`${id}.json matches its source (run npm run levels)`, () => {
      const json = JSON.parse(readFileSync(`public/levels/${id}.json`, 'utf8'));
      expect(json).toEqual(JSON.parse(JSON.stringify(build())));
    });

    it(`${id} passes validation`, () => {
      expect(validateLevel(build())).toEqual([]);
    });
  }

  it('validation catches a broken portal', () => {
    const data = LEVEL_SOURCES.level01();
    data.segments[0].children[SIDE.FRONT] = 5;
    expect(validateLevel(data).length).toBeGreaterThan(0);
  });
});

describe('LevelBuilder doors', () => {
  it('rejects doors on walls and duplicate doors from the other side', () => {
    const b = new LevelBuilder();
    const a = b.addBox([0, 0, 0], [4, 4, 4], 0);
    expect(() => b.door(a, SIDE.TOP)).toThrow();
    const c = b.extrude(a, SIDE.TOP, { length: 4 });
    b.door(a, SIDE.TOP);
    expect(() => b.door(c, SIDE.BOTTOM)).toThrow();
  });
});

describe('Door', () => {
  it('is reachable from both sides of the portal', () => {
    const { level, a, m } = corridor();
    expect(level.doorAt(a, SIDE.FRONT)).toBe(level.doors[0]);
    expect(level.doorAt(m, SIDE.BACK)).toBe(level.doors[0]);
  });

  it('blocks the ship while closed and lets it through when open', () => {
    const { level, a } = corridor();
    const pos = new Vector3(0, 0, 1.7); // door plane at z = 2
    const vel = new Vector3(0, 0, 5);
    expect(collideSphere(level, a, pos, vel, 0.9).hit).toBe(true);
    expect(pos.z).toBeCloseTo(1.1);

    level.doors[0].solid = false;
    const pos2 = new Vector3(0, 0, 1.7);
    expect(collideSphere(level, a, pos2, new Vector3(0, 0, 5), 0.9).hit).toBe(false);
  });

  it('opens when approached, then closes after the hold time', () => {
    const { level } = corridor();
    const door = new Door(level.doors[0]);
    const near = new Vector3(0, 0, 0);
    expect(run(door, DOOR_TUNING.openTime + 0.1, near)).toEqual(['opened']);
    expect(level.doors[0].openAmount).toBe(1);
    expect(level.doors[0].solid).toBe(false);

    const far = new Vector3(0, 0, 10);
    run(door, DOOR_TUNING.holdTime + DOOR_TUNING.openTime + 0.2, far);
    expect(level.doors[0].openAmount).toBe(0);
    expect(level.doors[0].solid).toBe(true);
  });

  it('does not close on a ship sitting in the doorway', () => {
    const { level } = corridor();
    const door = new Door(level.doors[0]);
    const inDoorway = new Vector3(0, 0, 2);
    run(door, 1, new Vector3(0, 0, 0));
    run(door, DOOR_TUNING.holdTime * 3, inDoorway);
    expect(level.doors[0].openAmount).toBe(1);
  });

  it('stays shut and reports locked without the key', () => {
    const { level } = corridor('red');
    const door = new Door(level.doors[0]);
    const events = run(door, 1, new Vector3(0, 0, 0));
    expect(events.every((e) => e === 'locked')).toBe(true);
    expect(level.doors[0].openAmount).toBe(0);
    expect(run(door, 1, new Vector3(0, 0, 0), true)).toContain('opened');
  });
});

describe('PortalCuller', () => {
  function cameraAt(pos: Vector3, lookAt: Vector3) {
    const cam = new PerspectiveCamera(80, 1, 0.05, 400);
    cam.position.copy(pos);
    cam.lookAt(lookAt);
    cam.updateMatrixWorld();
    return cam;
  }

  it('sees down an open corridor but not behind the camera', () => {
    const { level, a, m, c } = corridor();
    const culler = new PortalCuller(level);
    const forward = culler.compute(cameraAt(new Vector3(0, 0, -1), new Vector3(0, 0, 10)), a, () => true);
    expect([forward[a], forward[m], forward[c]]).toEqual([true, true, true]);

    const back = culler.compute(cameraAt(new Vector3(0, 0, 9), new Vector3(0, 0, 20)), c, () => true);
    expect(back[c]).toBe(true);
    expect(back[a]).toBe(false);
  });

  it('a closed portal hides everything behind it', () => {
    const { level, a, m, c } = corridor();
    const culler = new PortalCuller(level);
    const vis = culler.compute(cameraAt(new Vector3(0, 0, -1), new Vector3(0, 0, 10)), a,
      (seg, side) => !(seg === a && side === SIDE.FRONT));
    expect([vis[a], vis[m], vis[c]]).toEqual([true, false, false]);
  });
});
