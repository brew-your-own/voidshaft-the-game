import { Vector3 } from 'three';
import { OPPOSITE, SIDE_VERTS } from './geometry';
import type { KeyColor, LevelData } from './types';

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

/** Runtime state of a door; rendering and logic live in entities/Door. */
export interface DoorState {
  index: number;
  segment: number;
  side: number;
  child: number;
  key: KeyColor | null;
  /** Level exit: sealed until the reactor is destroyed. */
  exit: boolean;
  /** Portal quad as seen from `segment`. */
  quad: Vector3[];
  center: Vector3;
  /** Normal pointing into `segment`. */
  normal: Vector3;
  /** Blocking triangles, facing into both segments. */
  tris: Tri[];
  /** 0 = closed, 1 = fully open. */
  openAmount: number;
  solid: boolean;
}

const CONTAIN_EPS = 0.05;

/** Runtime level: segment graph plus spatial queries. */
export class Level {
  readonly name: string;
  readonly vertices: Vector3[];
  readonly segments: Segment[];
  readonly doors: DoorState[];
  private readonly nearWallsCache = new Map<number, Tri[]>();
  private readonly nearDoorsCache = new Map<number, DoorState[]>();
  private readonly doorByPortal = new Map<string, DoorState>();

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

    this.doors = (data.doors ?? []).map((d, index): DoorState => {
      const seg = this.segments[d.segment];
      const child = seg.children[d.side];
      const side = seg.sides[d.side];
      const center = side.quad.reduce((acc, v) => acc.add(v), new Vector3()).multiplyScalar(0.25);
      const normal = side.tris[0].n.clone().add(side.tris[1].n).normalize();
      const door: DoorState = {
        index, segment: d.segment, side: d.side, child, key: d.key, exit: !!d.exit,
        quad: side.quad, center, normal,
        tris: [...side.tris, ...this.segments[child].sides[OPPOSITE[d.side]].tris],
        openAmount: 0, solid: true,
      };
      this.doorByPortal.set(`${d.segment}:${d.side}`, door);
      this.doorByPortal.set(`${child}:${OPPOSITE[d.side]}`, door);
      return door;
    });
  }

  /** Door in the portal on `side` of `seg`, if any (works from both sides). */
  doorAt(seg: number, side: number): DoorState | undefined {
    return this.doorByPortal.get(`${seg}:${side}`);
  }

  /** Doors within two portal hops of a segment. */
  nearDoors(seg: number): DoorState[] {
    let doors = this.nearDoorsCache.get(seg);
    if (!doors) {
      const near = new Set(this.neighbourhood(seg, 2));
      doors = this.doors.filter((d) => near.has(d.segment) || near.has(d.child));
      this.nearDoorsCache.set(seg, doors);
    }
    return doors;
  }

  /**
   * Whether the straight line a→b stays inside the level and doesn't cross
   * a closed door. Walks the line in short steps tracking the segment.
   */
  lineOfSight(a: Vector3, segA: number, b: Vector3, step = 0.75): boolean {
    const dist = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(dist / step));
    const p = new Vector3();
    let seg = segA;
    for (let i = 1; i <= n; i++) {
      p.lerpVectors(a, b, i / n);
      const next = this.findSegment(p, seg);
      if (next < 0) return false;
      if (next !== seg) {
        const side = this.segments[seg].children.indexOf(next);
        if (side >= 0 && this.doorAt(seg, side)?.solid) return false;
      }
      seg = next;
    }
    return true;
  }

  /** Centre of the face on `side` of `seg` (portal centre for open sides). */
  sideCenter(seg: number, side: number, out = new Vector3()): Vector3 {
    out.set(0, 0, 0);
    for (const v of this.segments[seg].sides[side].quad) out.add(v);
    return out.multiplyScalar(0.25);
  }

  /**
   * Shortest portal path from `from` to `to` (BFS over the segment graph),
   * including both ends. `passable(seg, side)` can veto portals (closed
   * doors). Returns null when unreachable.
   */
  findPath(from: number, to: number, passable: (seg: number, side: number) => boolean = () => true): number[] | null {
    if (from === to) return [from];
    const prev = new Map<number, number>([[from, -1]]);
    const queue = [from];
    for (let qi = 0; qi < queue.length; qi++) {
      const s = queue[qi];
      const children = this.segments[s].children;
      for (let side = 0; side < 6; side++) {
        const c = children[side];
        if (c < 0 || prev.has(c) || !passable(s, side)) continue;
        prev.set(c, s);
        if (c === to) {
          const path = [c];
          for (let p = s; p !== -1; p = prev.get(p)!) path.push(p);
          return path.reverse();
        }
        queue.push(c);
      }
    }
    return null;
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
