import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STATIC_LIGHT_TUNING, StaticLights } from '../src/fx/StaticLights';
import { SIDE } from '../src/level/geometry';
import { GridLayout } from '../src/level/GridLayout';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { validateLevel } from '../src/level/LevelLoader';
import { analyseProgression } from '../src/level/progression';
import type { LightData } from '../src/level/types';

function grid(rows: string[], opts: { separate?: string[]; warp?: number; upper?: string[] } = {}) {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: opts.warp ?? 0, seed: 9, separate: opts.separate,
    legend: { a: 1, b: 2, k: 3, d: 4, x: 5, '1': 6 },
  });
  g.floor(0, rows);
  if (opts.upper) g.floor(1, opts.upper);
  g.build();
  return { b, g };
}

describe('GridLayout', () => {
  it('links face-adjacent cells and shares their lattice vertices', () => {
    const { b, g } = grid(['aa', '.a'], { upper: ['.a'] });
    const data = b.build('t', g.at(0, 0), [0, 0, 1]);
    expect(validateLevel(data)).toEqual([]);
    expect(data.segments[g.at(0, 0)].children[SIDE.RIGHT]).toBe(g.at(1, 0));
    expect(data.segments[g.at(1, 0)].children[SIDE.FRONT]).toBe(g.at(1, 1));
    expect(data.segments[g.at(1, 0)].children[SIDE.TOP]).toBe(g.at(1, 0, 1));
    // 8 lattice points per layer under the L-shape, two layers, plus 4 on top of the stacked cell.
    expect(data.vertices.length).toBe(8 * 2 + 4);
  });

  it('keeps separated characters apart', () => {
    const { b, g } = grid(['ab'], { separate: ['ab'] });
    expect(b.segments[g.at(0, 0)].children[SIDE.RIGHT]).toBe(-1);
  });

  it('warps the lattice but keeps every face flat and every centre inside', () => {
    const { b, g } = grid(['aaa', 'a.a', 'aaa'], { warp: 1.5, upper: ['a..', '...', '..a'] });
    const level = new Level(b.build('t', g.at(0, 0), [0, 0, 1]));
    for (const s of level.segments) {
      expect(level.findSegment(s.center)).toBe(s.index);
      for (const side of s.sides) {
        const [p, q, r, t] = side.quad;
        const n = new Vector3().subVectors(q, p).cross(new Vector3().subVectors(r, p)).normalize();
        expect(Math.abs(n.dot(new Vector3().subVectors(t, p)))).toBeLessThan(1e-6);
      }
    }
  });

  it('finds the one portal between two characters, and refuses ambiguity', () => {
    const { g } = grid(['a1b', 'a.b']);
    expect(g.portal('1', 'b')).toEqual({ segment: g.at(1, 0), side: SIDE.RIGHT });
    expect(() => g.portal('a', 'b')).toThrow(/0 portals/);
    expect(() => g.one('a')).toThrow(/2 cells/);
    expect(() => g.at(1, 1)).toThrow(/rock/);
  });

  it('rejects characters missing from the legend', () => {
    expect(() => grid(['a?'])).toThrow(/legend/);
  });
});

describe('analyseProgression', () => {
  // a = start area, 1 = door neck, b = locked area with the reactor, x = exit.
  function mine(lockKey: 'blue' | null, keyIn: 'a' | 'b') {
    const { b, g } = grid(['xa1bb']);
    g.door('1', 'b', lockKey);
    g.exit('a', 'x');
    b.key(g.at(keyIn === 'a' ? 1 : 4, 0), 'blue');
    b.reactor(g.at(3, 0), [0, 0, 0], [], 30);
    return b.build('t', g.at(1, 0), [1, 0, 0]);
  }

  it('collects keys round by round and opens the exit after the reactor', () => {
    const p = analyseProgression(mine('blue', 'a'));
    expect(p).toEqual({ keyRounds: [['blue']], reactorRound: 1, allKeys: true, exitReachable: true, exitLeaks: false });
  });

  it('notices a key locked behind its own door', () => {
    const p = analyseProgression(mine('blue', 'b'));
    expect(p.allKeys).toBe(false);
    expect(p.reactorRound).toBe(-1);
    expect(p.exitReachable).toBe(false);
  });
});

describe('StaticLights', () => {
  const light = (x: number): LightData => ({ position: [x, 0, 0], color: 0xffffff, intensity: 10, distance: 10 });

  it('gives every light a fixed slot when there are few enough', () => {
    const s = new StaticLights([light(0), light(50)], 1, 4);
    expect(s.object.children.length).toBe(4);
    expect(s.shown.sort()).toEqual([0, 1]);
    s.update(1, new Vector3(1000, 0, 0));
    expect(s.shown.sort()).toEqual([0, 1]);
  });

  it('shows the lights nearest the eye, fading slots over to new ones', () => {
    const all = Array.from({ length: 10 }, (_, i) => light(i * 100));
    const s = new StaticLights(all, 1, 2);
    const eye = new Vector3(0, 0, 0);
    s.update(1, eye);
    s.update(1, eye);
    expect(s.shown.sort()).toEqual([0, 1]);
    const lit = () => s.object.children.reduce((n, l) => n + (l as unknown as { intensity: number }).intensity, 0);
    expect(lit()).toBeCloseTo(20);

    // Fly to the far end: slots fade out, then switch to the lights there.
    eye.set(900, 0, 0);
    s.update(0.1, eye);
    expect(lit()).toBeLessThan(20);
    for (let i = 0; i < 20; i++) s.update(0.1, eye);
    expect(s.shown.sort()).toEqual([8, 9]);
    expect(lit()).toBeCloseTo(20);
    // The count of lights in the scene never changes.
    expect(s.object.children.length).toBe(2);
    expect(STATIC_LIGHT_TUNING.slots).toBeGreaterThan(0);
  });
});
