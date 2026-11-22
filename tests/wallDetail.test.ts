import { BufferGeometry, Color, Mesh, ShaderLib, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bilerp, SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { buildLevelMesh } from '../src/level/LevelMesh';
import { LEVEL_SOURCES } from '../src/level/levels';
import { doorEdges, hazardEdge, panelPlates, WallSink } from '../src/level/wallPanels';
import { mulberry32 } from '../src/render/GeometrySink';
import { patchWallShader, WALL_DETAIL_TUNING, WALL_KIND } from '../src/render/WallDetail';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Parallelogram from an origin and two edge vectors. */
function parallelogram(o: Vector3, eu: Vector3, ev: Vector3): Vector3[] {
  return [o.clone(), o.clone().add(eu), o.clone().add(eu).add(ev), o.clone().add(ev)];
}

describe('panelPlates', () => {
  it('splits a rectangle into whole plates near the target size', () => {
    const p = panelPlates(parallelogram(v(0, 0, 0), v(2.1, 0, 0), v(0, 0, 3.3)), 1);
    expect(p.count).toEqual([2, 3]);
    expect(p.size[0]).toBeCloseTo(1.05);
    expect(p.size[1]).toBeCloseTo(1.1);
  });

  it('keeps at least one plate on small faces', () => {
    const p = panelPlates(parallelogram(v(0, 0, 0), v(0.3, 0, 0), v(0, 0.2, 0)), 1);
    expect(p.count).toEqual([1, 1]);
    expect(p.size[0]).toBeCloseTo(0.3);
  });

  it('measures plate size across the seams on sheared faces', () => {
    // 30° shear: seams along v are 2 × sin(60°) apart, not 2.
    const eu = v(2, 0, 0), ev = v(Math.cos(Math.PI / 3) * 2, Math.sin(Math.PI / 3) * 2, 0);
    const p = panelPlates(parallelogram(v(1, 2, 3), eu, ev), 2);
    expect(p.count).toEqual([1, 1]);
    expect(p.size[0]).toBeCloseTo(2 * Math.sin(Math.PI / 3));
    expect(p.size[1]).toBeCloseTo(2 * Math.sin(Math.PI / 3));
  });

  it('gives consistent plate sizes on randomly sheared, differently sized faces', () => {
    const rng = mulberry32(7);
    const target = WALL_DETAIL_TUNING.plateSize;
    for (let n = 0; n < 500; n++) {
      const lu = 0.6 + rng() * 8, lv = 0.6 + rng() * 6;
      const eu = v(lu, (rng() - 0.5) * 1.5, (rng() - 0.5) * 1.5).setLength(lu);
      const ev = v((rng() - 0.5) * 1.5, lv, (rng() - 0.5) * 1.5).setLength(lv);
      const { count, size } = panelPlates(parallelogram(v(rng(), rng(), rng()), eu, ev), target);
      for (let a = 0; a < 2; a++) {
        const len = a === 0 ? lu : lv;
        if (len < target * 1.5) {
          expect(count[a]).toBe(1);
        } else {
          // Whole plates within ±50 % of the target, minus the shear factor.
          expect(size[a]).toBeGreaterThan(target / 1.5 * 0.85);
          expect(size[a]).toBeLessThan(target * 1.5);
        }
      }
    }
  });
});

describe('WallSink', () => {
  it('writes one set of detail attributes per vertex, in the stored winding order', () => {
    const sink = new WallSink();
    const q = parallelogram(v(0, 0, 0), v(3, 0.4, 0), v(0.5, 2, 0));
    const plates = panelPlates(q, 1);
    const detail = { plates, seed: 0.25, kind: WALL_KIND.PLATE, accent: new Color(1, 0.5, 0) };
    // Both windings: `inside` on either side of the quad.
    sink.detailQuad(q, new Color(), v(0, 0, 1), detail);
    sink.detailQuad(q, new Color(), v(0, 0, -1), detail);
    sink.quad(q[0], q[1], q[2], q[3], new Color(), v(0, 0, 1));
    const g: BufferGeometry = sink.toGeometry(true);
    const n = g.getAttribute('position').count;
    expect(n).toBe(18);
    expect(g.getAttribute('wallUv').count).toBe(n);
    expect(g.getAttribute('wallPanel').count).toBe(n);
    expect(g.getAttribute('wallAccent').count).toBe(n);

    const pos = g.getAttribute('position'), uv = g.getAttribute('wallUv'), panel = g.getAttribute('wallPanel');
    for (let i = 0; i < 12; i++) {
      const expected = bilerp(q, uv.getX(i) / uv.getZ(i), uv.getY(i) / uv.getW(i));
      expect(v(pos.getX(i), pos.getY(i), pos.getZ(i)).distanceTo(expected)).toBeLessThan(1e-5);
      expect(panel.getZ(i)).toBe(WALL_KIND.PLATE);
      expect(panel.getW(i)).toBe(0.25);
    }
    for (let i = 12; i < 18; i++) expect(panel.getZ(i)).toBe(WALL_KIND.NONE);
  });

  it('refuses geometry whose attributes fell out of step', () => {
    const sink = new WallSink();
    sink.tri(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), new Color(), v(0, 0, 1));
    expect(() => sink.toGeometry(true)).toThrow();
  });
});

describe('door hazard edges', () => {
  function neck() {
    const b = new LevelBuilder();
    const a = b.addBox([0, 0, 0], [4, 4, 4], 0xffffff);
    const m = b.extrude(a, SIDE.FRONT, { length: 4 });
    b.door(a, SIDE.FRONT);
    return { level: new Level(b.build('t', a, [0, 0, 1])), a, m };
  }

  it('finds the wall edges shared with a door portal, from both sides', () => {
    const { level, a, m } = neck();
    for (const [seg, door] of [[a, SIDE.FRONT], [m, SIDE.BACK]]) {
      for (const side of [SIDE.LEFT, SIDE.RIGHT, SIDE.BOTTOM, SIDE.TOP]) {
        const edges = doorEdges(level, seg, side);
        expect(edges).toHaveLength(1);
        const q = level.segments[seg].sides[side].quad;
        const portal = level.segments[seg].sides[door].quad;
        for (const p of [q[edges[0]], q[(edges[0] + 1) % 4]]) {
          expect(portal.some((c) => c.distanceTo(p) < 1e-6)).toBe(true);
        }
      }
      expect(doorEdges(level, seg, door === SIDE.FRONT ? SIDE.BACK : SIDE.FRONT)).toEqual([]);
    }
  });

  it('maps door edges to the panels that touch them', () => {
    expect(hazardEdge([0], 1, 0, 3, 2)).toBe(2);
    expect(hazardEdge([1], 2, 1, 3, 2)).toBe(1);
    expect(hazardEdge([2], 0, 1, 3, 2)).toBe(3);
    expect(hazardEdge([3], 0, 1, 3, 2)).toBe(0);
    expect(hazardEdge([3], 1, 1, 3, 2)).toBe(-1);
    expect(hazardEdge([], 0, 0, 1, 1)).toBe(-1);
  });
});

describe('level wall meshes', () => {
  it('carry detail attributes matching their vertex count on every level', () => {
    for (const [id, build] of Object.entries(LEVEL_SOURCES)) {
      const data = build();
      const { segments } = buildLevelMesh(new Level(data));
      let hazards = 0;
      for (const group of segments) {
        const walls = group.children.find((c): c is Mesh => c instanceof Mesh && c.geometry.hasAttribute('normal'));
        if (!walls) continue; // segment with no solid walls
        const g = walls.geometry;
        const n = g.getAttribute('position').count;
        expect(g.getAttribute('wallUv').count, id).toBe(n);
        expect(g.getAttribute('wallPanel').count, id).toBe(n);
        expect(g.getAttribute('wallAccent').count, id).toBe(n);
        const panel = g.getAttribute('wallPanel');
        for (let i = 0; i < n; i++) {
          const kind = panel.getZ(i);
          if (kind >= WALL_KIND.HAZARD) hazards++;
          if (kind !== WALL_KIND.NONE) {
            expect(panel.getX(i), id).toBeGreaterThan(0.2);
            expect(panel.getY(i), id).toBeGreaterThan(0.2);
          }
        }
      }
      if (data.doors.length) expect(hazards, id).toBeGreaterThan(0);
    }
  });
});

describe('wall shader patch', () => {
  it('finds every include it hooks into in the standard material shaders', () => {
    const shader = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    patchWallShader(shader);
    expect(shader.vertexShader).toContain('attribute vec4 wallUv;');
    expect(shader.vertexShader).toContain('vWallPanel = wallPanel;');
    expect(shader.fragmentShader).toContain('roughnessFactor *= wallRough;');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += wallEmissive;');
    // The detail block runs after the vertex colour is applied.
    const frag = shader.fragmentShader;
    expect(frag.indexOf('float wallRough')).toBeGreaterThan(frag.indexOf('#include <color_fragment>'));
  });
});
