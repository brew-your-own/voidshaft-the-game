import { Vector3 } from 'three';
import { SIDE_VERTS } from './geometry';
import type { LevelData } from './types';

/** A triangle with its plane; the normal points into the segment interior. */
export interface Tri {
  a: Vector3;
  b: Vector3;
  c: Vector3;
  n: Vector3;
  d: number;
}

export interface SideGeom {
  quad: Vector3[];
  tris: [Tri, Tri];
  isWall: boolean;
}

export interface Segment {
  index: number;
  verts: number[];
  children: number[];
  color: number;
  center: Vector3;
  sides: SideGeom[];
}

const CONTAIN_EPS = 0.05;

/** Runtime level: segment graph plus spatial queries. */
export class Level {
  readonly name: string;
  readonly vertices: Vector3[];
  readonly segments: Segment[];
  private readonly nearWallsCache = new Map<number, Tri[]>();

  constructor(readonly data: LevelData) {
    this.name = data.name;
    this.vertices = data.vertices.map(([x, y, z]) => new Vector3(x, y, z));
    this.segments = data.segments.map((s, index) => {
      const center = s.verts
        .reduce((acc, i) => acc.add(this.vertices[i]), new Vector3())
        .multiplyScalar(1 / 8);
      const sides = SIDE_VERTS.map((sv, side): SideGeom => {
        const quad = sv.map((lv) => this.vertices[s.verts[lv]]);
        // Split along q0-q2; neighbouring segments share this diagonal.
        return {
          quad,
          tris: [makeTri(quad[0], quad[1], quad[2], center), makeTri(quad[0], quad[2], quad[3], center)],
          isWall: s.children[side] === -1,
        };
      });
      return { index, verts: s.verts, children: s.children, color: s.color, center, sides };
    });
  }

  /** Smallest signed distance from p to the segment's side planes (>0 = inside). */
  containment(p: Vector3, seg: number): number {
    let min = Infinity;
    for (const side of this.segments[seg].sides) {
      for (const t of side.tris) min = Math.min(min, t.n.dot(p) + t.d);
    }
    return min;
  }

  /**
   * Segment containing p, searching near `hint` first. Returns -1 if p is
   * outside the level.
   */
  findSegment(p: Vector3, hint = -1): number {
    if (hint >= 0) {
      if (this.containment(p, hint) >= 0) return hint;
      let best = -1;
      let bestScore = -Infinity;
      for (const s of this.neighbourhood(hint, 2)) {
        const score = this.containment(p, s);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      if (bestScore >= -CONTAIN_EPS) return best;
    }
    let best = -1;
    let bestScore = -Infinity;
    for (let s = 0; s < this.segments.length; s++) {
      const score = this.containment(p, s);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return bestScore >= -CONTAIN_EPS ? best : -1;
  }

  /** Wall triangles of a segment and of segments within two portal hops. */
  nearWalls(seg: number): Tri[] {
    let tris = this.nearWallsCache.get(seg);
    if (!tris) {
      tris = [];
      for (const s of this.neighbourhood(seg, 2)) {
        for (const side of this.segments[s].sides) if (side.isWall) tris.push(...side.tris);
      }
      this.nearWallsCache.set(seg, tris);
    }
    return tris;
  }

  /** Segments reachable within `depth` portal hops (including seg itself). */
  neighbourhood(seg: number, depth: number): number[] {
    const seen = new Set([seg]);
    let frontier = [seg];
    for (let d = 0; d < depth; d++) {
      const next: number[] = [];
      for (const s of frontier) {
        for (const c of this.segments[s].children) {
          if (c >= 0 && !seen.has(c)) { seen.add(c); next.push(c); }
        }
      }
      frontier = next;
    }
    return [...seen];
  }
}

function makeTri(a: Vector3, b: Vector3, c: Vector3, inside: Vector3): Tri {
  const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
  if (n.dot(new Vector3().subVectors(inside, a)) < 0) n.negate();
  return { a, b, c, n, d: -n.dot(a) };
}
