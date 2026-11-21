import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { MapMemory, buildDoorLines, buildWallLines, seenBounds } from '../src/level/automap';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { ResolutionGovernor, RESOLUTION_TUNING } from '../src/render/Resolution';

/** Two 4 m boxes joined front to back, with a gold door between them. */
function twoBoxes() {
  const b = new LevelBuilder();
  const a = b.addBox([0, 0, 0], [4, 4, 4], 0xff0000);
  b.extrude(a, SIDE.FRONT, { length: 4 });
  b.door(a, SIDE.FRONT, 'gold');
  return new Level(b.build('t', a, [0, 0, 1]));
}

const lines = (m: { positions: number[] }) => m.positions.length / 6;

describe('MapMemory', () => {
  it('remembers segments once and reports new ones', () => {
    const m = new MapMemory(3);
    expect(m.markVisible([true, false, false])).toBe(true);
    expect(m.markVisible([true, false, false])).toBe(false);
    expect(m.mark(2)).toBe(true);
    expect(m.mark(-1)).toBe(false);
    expect(m.count).toBe(2);
    expect(m.seen).toEqual([true, false, true]);
  });
});

describe('automap lines', () => {
  it('draws each wall edge of the seen segments once', () => {
    const level = twoBoxes();
    expect(lines(buildWallLines(level, [false, false]))).toBe(0);
    // A box with one open side still has all 12 edges on its walls.
    expect(lines(buildWallLines(level, [true, false]))).toBe(12);
    // The 4 edges around the shared face are not drawn twice.
    expect(lines(buildWallLines(level, [true, true]))).toBe(20);
  });

  it('colours walls with the segment accent, dimmed', () => {
    const { colors } = buildWallLines(twoBoxes(), [true, false]);
    expect(colors[0]).toBeGreaterThan(0.3);
    expect(colors[0]).toBeLessThan(1);
    expect(colors[1]).toBe(0);
  });

  it('shows a door once either side is seen', () => {
    const level = twoBoxes();
    const gold = new Color(1, 0.8, 0);
    expect(lines(buildDoorLines(level, [false, false], () => gold))).toBe(0);
    const seen = buildDoorLines(level, [false, true], () => gold);
    expect(lines(seen)).toBe(6); // outline + cross
    expect(seen.colors.slice(0, 3)).toEqual([1, 0.8, 0]);
  });

  it('frames the seen part of the level', () => {
    const level = twoBoxes();
    expect(seenBounds(level, [false, false]).radius).toBe(0);
    const one = seenBounds(level, [true, false]).radius;
    const both = seenBounds(level, [true, true]).radius;
    expect(both).toBeGreaterThan(one);
  });
});

describe('ResolutionGovernor', () => {
  const run = (g: ResolutionGovernor, dt: number, seconds: number) => {
    let changes = 0;
    for (let t = 0; t < seconds; t += dt) if (g.update(dt, true)) changes++;
    return changes;
  };

  it('keeps full resolution while frames are fast', () => {
    const g = new ResolutionGovernor();
    expect(run(g, 1 / 60, 10)).toBe(0);
    expect(g.scale).toBe(1);
  });

  it('steps down on sustained slow frames, never below the minimum', () => {
    const g = new ResolutionGovernor();
    run(g, 1 / 30, 2);
    expect(g.scale).toBeLessThan(1);
    run(g, 1 / 20, 30);
    expect(g.scale).toBe(RESOLUTION_TUNING.min);
  });

  it('ignores a single hitch', () => {
    const g = new ResolutionGovernor();
    run(g, 1 / 60, 2);
    g.update(0.1, true);
    run(g, 1 / 60, 2);
    expect(g.scale).toBe(1);
  });

  it('climbs back slowly once there is headroom, and resets when disabled', () => {
    const g = new ResolutionGovernor();
    run(g, 1 / 30, 1.5);
    run(g, 1 / 60, 1);
    const low = g.scale;
    expect(low).toBeLessThan(1);
    run(g, 1 / 60, 3);
    expect(g.scale).toBe(low); // too soon after a drop
    run(g, 1 / 60, 120);
    expect(g.scale).toBe(1);
    run(g, 1 / 30, 1.5);
    expect(g.update(1 / 30, false)).toBe(true);
    expect(g.scale).toBe(1);
  });
});
