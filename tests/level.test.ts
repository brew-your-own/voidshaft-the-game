import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { closestPointOnTriangle, OPPOSITE, SIDE, SIDE_VERTS, partnerVertex } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { buildLevel01 } from '../src/level/levels/level01';
import { collideSphere } from '../src/physics/Collision';

function twoBoxes() {
  const b = new LevelBuilder();
  const a = b.addBox([0, 0, 0], [4, 4, 4], 0xffffff);
  const c = b.extrude(a, SIDE.FRONT, { length: 4 });
  return { level: new Level(b.build('t', a, [0, 0, 1])), a, c };
}

describe('geometry tables', () => {
  it('partner vertices of a side form the opposite side', () => {
    for (let s = 0; s < 6; s++) {
      const partners = SIDE_VERTS[s].map((v) => partnerVertex(s, v)).sort();
      expect(partners).toEqual([...SIDE_VERTS[OPPOSITE[s]]].sort());
    }
  });

  it('closest point on triangle handles interior, edge and vertex regions', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(2, 0, 0), c = new Vector3(0, 2, 0);
    const out = new Vector3();
    expect(closestPointOnTriangle(new Vector3(0.5, 0.5, 3), a, b, c, out).toArray()).toEqual([0.5, 0.5, 0]);
    expect(closestPointOnTriangle(new Vector3(1, -1, 0), a, b, c, out).toArray()).toEqual([1, 0, 0]);
    expect(closestPointOnTriangle(new Vector3(-1, -1, 0), a, b, c, out).toArray()).toEqual([0, 0, 0]);
  });
});

describe('LevelBuilder', () => {
  it('extrusion shares the face and links both segments', () => {
    const { level, a, c } = twoBoxes();
    expect(level.segments[a].children[SIDE.FRONT]).toBe(c);
    expect(level.segments[c].children[SIDE.BACK]).toBe(a);
    const shared = SIDE_VERTS[SIDE.FRONT].map((v) => level.segments[a].verts[v]).sort();
    const back = SIDE_VERTS[SIDE.BACK].map((v) => level.segments[c].verts[v]).sort();
    expect(back).toEqual(shared);
    expect(level.segments[c].center.z).toBeCloseTo(4);
  });

  it('refuses to extrude an already connected side', () => {
    const b = new LevelBuilder();
    const a = b.addBox([0, 0, 0], [4, 4, 4], 0);
    b.extrude(a, SIDE.TOP, { length: 2 });
    expect(() => b.extrude(a, SIDE.TOP, { length: 2 })).toThrow();
  });
});

describe('Level queries', () => {
  it('finds the segment containing a point, or -1 outside', () => {
    const { level, a, c } = twoBoxes();
    expect(level.findSegment(new Vector3(0, 0, 0))).toBe(a);
    expect(level.findSegment(new Vector3(0, 0, 4), a)).toBe(c);
    expect(level.findSegment(new Vector3(0, 10, 0))).toBe(-1);
  });

  it('every segment centre of level01 resolves to its own segment', () => {
    const level = new Level(buildLevel01());
    level.segments.forEach((s) => expect(level.findSegment(s.center)).toBe(s.index));
  });
});

describe('collideSphere', () => {
  it('pushes a sphere out of a wall and kills inbound velocity', () => {
    const { level, a } = twoBoxes();
    const pos = new Vector3(0, -1.5, 0); // floor is at y = -2
    const vel = new Vector3(1, -5, 0);
    const r = collideSphere(level, a, pos, vel, 0.9, 0);
    expect(r.hit).toBe(true);
    expect(pos.y).toBeCloseTo(-1.1);
    expect(vel.y).toBeCloseTo(0);
    expect(vel.x).toBeCloseTo(1);
  });

  it('does not collide with the open portal between segments', () => {
    const { level, a } = twoBoxes();
    const pos = new Vector3(0, 0, 1.8); // near the shared FRONT face
    const vel = new Vector3(0, 0, 5);
    expect(collideSphere(level, a, pos, vel, 0.9).hit).toBe(false);
    expect(vel.z).toBe(5);
  });
});
