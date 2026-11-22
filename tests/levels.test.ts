import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { REACTOR_TUNING } from '../src/entities/Reactor';
import { ROBOT_TUNING } from '../src/entities/robots/tuning';
import { Level } from '../src/level/Level';
import { validateLevel } from '../src/level/LevelLoader';
import { LEVEL_SOURCES } from '../src/level/levels';
import { analyseProgression } from '../src/level/progression';
import type { LevelData, Vec3 } from '../src/level/types';
import { distanceToTris } from '../src/physics/Collision';
import { SHIP_TUNING } from '../src/physics/Ship';

const LEVELS = Object.entries(LEVEL_SOURCES).map(([id, build]) => ({ id, data: build() }));
/** The original test mine; the bigger levels follow stricter rules. */
const FIRST = 'level01';

/** Clearance from walls for things placed in a level. */
const CLEARANCE = { pickup: 0.8, light: 0.5 };

function placements(data: LevelData): { what: string; segment: number; position: Vec3; radius: number }[] {
  return [
    { what: 'start', ...data.playerStart, radius: SHIP_TUNING.radius },
    ...data.robots.map((r, i) => ({ what: `robot ${i} (${r.type})`, ...r, radius: ROBOT_TUNING[r.type].radius })),
    ...data.keys.map((k) => ({ what: `key ${k.color}`, ...k, radius: CLEARANCE.pickup })),
    ...data.pickups.map((p, i) => ({ what: `pickup ${i} (${p.kind})`, ...p, radius: CLEARANCE.pickup })),
    ...data.targets.map((t, i) => ({ what: `target ${i}`, ...t, radius: CLEARANCE.pickup })),
    ...(data.reactor ? [
      { what: 'reactor', segment: data.reactor.segment, position: data.reactor.position, radius: REACTOR_TUNING.radius },
      ...data.reactor.pylons.map((p, i) => ({ what: `pylon ${i}`, ...p, radius: REACTOR_TUNING.pylonRadius })),
    ] : []),
  ];
}

describe.each(LEVELS)('$id', ({ id, data }) => {
  const level = new Level(data);

  it('passes the loader checks', () => {
    expect(validateLevel(data)).toEqual([]);
  });

  it('every face is flat and every segment centre resolves to its own segment', () => {
    for (const s of level.segments) {
      expect(level.findSegment(s.center)).toBe(s.index);
      for (const side of s.sides) {
        const [a, b, c, d] = side.quad;
        const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
        expect(Math.abs(n.dot(new Vector3().subVectors(d, a)))).toBeLessThan(0.05);
      }
    }
  });

  it('no two segments overlap', () => {
    const overlaps: string[] = [];
    const p = new Vector3();
    for (const s of level.segments) {
      const samples = [s.center, ...s.verts.map((v) => p.clone().lerpVectors(s.center, level.vertices[v], 0.7))];
      for (const t of level.segments) {
        if (t === s) continue;
        if (samples.some((q) => level.containment(q, t.index) > 0.05)) overlaps.push(`${s.index}/${t.index}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('everything placed sits inside its segment, clear of the walls', () => {
    const bad: string[] = [];
    const p = new Vector3();
    for (const t of placements(data)) {
      p.set(...t.position);
      const inside = level.containment(p, t.segment) >= 0;
      const gap = distanceToTris(p, level.nearWalls(t.segment));
      if (!inside || gap < t.radius + 0.2) bad.push(`${t.what}: inside=${inside} gap=${gap.toFixed(2)}`);
    }
    for (const [i, l] of data.lights.entries()) {
      p.set(...l.position);
      const seg = level.findSegment(p);
      if (seg < 0 || distanceToTris(p, level.nearWalls(seg)) < CLEARANCE.light) bad.push(`light ${i}`);
    }
    expect(bad).toEqual([]);
  });

  it('can be finished: keys, then the reactor, then the exit', () => {
    const prog = analyseProgression(data);
    expect(prog.allKeys).toBe(true);
    expect(prog.reactorRound).toBeGreaterThanOrEqual(0);
    expect(prog.exitLeaks).toBe(false);
    expect(prog.exitReachable).toBe(true);
  });

  it.skipIf(id === FIRST)('follows blue → gold → red, with the reactor last', () => {
    const prog = analyseProgression(data);
    expect(prog.keyRounds).toEqual([['blue'], ['gold'], ['red']]);
    expect(prog.reactorRound).toBe(3);
  });

  it.skipIf(id === FIRST)('is bigger than the first level, with loops and a theme', () => {
    expect(data.segments.length).toBeGreaterThan(32);
    // Independent cycles in the segment graph: portals − segments + 1.
    const portals = data.segments.reduce((n, s) => n + s.children.filter((c) => c >= 0).length, 0) / 2;
    expect(portals - data.segments.length + 1).toBeGreaterThanOrEqual(3);
    expect(data.theme).toBeDefined();
  });
});

describe('level list', () => {
  it('has unique names and grows in size after the first level', () => {
    expect(new Set(LEVELS.map((l) => l.data.name)).size).toBe(LEVELS.length);
    const sizes = LEVELS.filter((l) => l.id !== FIRST).map((l) => l.data.segments.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});
