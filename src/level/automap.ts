import { Color, Vector3 } from 'three';
import { SIDE_VERTS } from './geometry';
import type { DoorState, Level } from './Level';

/** Which segments the player has seen; the automap only shows those. */
export class MapMemory {
  readonly seen: boolean[];
  private seenCount = 0;

  constructor(segmentCount: number) {
    this.seen = new Array<boolean>(segmentCount).fill(false);
  }

  get count(): number {
    return this.seenCount;
  }

  /** Marks one segment; returns true if it was new. */
  mark(seg: number): boolean {
    if (seg < 0 || seg >= this.seen.length || this.seen[seg]) return false;
    this.seen[seg] = true;
    this.seenCount++;
    return true;
  }

  /** Marks every segment flagged in `visible` (portal culling output); true if any was new. */
  markVisible(visible: readonly boolean[]): boolean {
    let added = false;
    for (let i = 0; i < visible.length; i++) if (visible[i] && this.mark(i)) added = true;
    return added;
  }
}

/** Flat arrays ready for a LineSegments geometry: two points per line. */
export interface MapLines {
  positions: number[];
  colors: number[];
}

export const AUTOMAP_STYLE = {
  /** Wall edges use the segment's accent colour at this brightness. */
  wallBrightness: 0.75,
  /** Door outlines are inset this much towards the door centre. */
  doorInset: 0.18,
};

const _c = new Color();
const _p = new Vector3();

/**
 * Wall edges of the seen segments, each edge once even when several walls
 * or segments share it. An edge takes the colour of the first seen segment
 * that has it.
 */
export function buildWallLines(level: Level, seen: readonly boolean[]): MapLines {
  const out: MapLines = { positions: [], colors: [] };
  const done = new Set<number>();
  const n = level.vertices.length;
  for (const seg of level.segments) {
    if (!seen[seg.index]) continue;
    _c.set(seg.color).multiplyScalar(AUTOMAP_STYLE.wallBrightness);
    for (let side = 0; side < 6; side++) {
      if (!seg.sides[side].isWall) continue;
      const sv = SIDE_VERTS[side];
      for (let k = 0; k < 4; k++) {
        const a = seg.verts[sv[k]], b = seg.verts[sv[(k + 1) % 4]];
        const key = Math.min(a, b) * n + Math.max(a, b);
        if (done.has(key)) continue;
        done.add(key);
        pushLine(out, level.vertices[a], level.vertices[b], _c);
      }
    }
  }
  return out;
}

/**
 * Doors next to a seen segment: an inset outline with a cross, coloured
 * by `colorOf` (key colour, exit, plain door).
 */
export function buildDoorLines(level: Level, seen: readonly boolean[], colorOf: (door: DoorState) => Color): MapLines {
  const out: MapLines = { positions: [], colors: [] };
  for (const door of level.doors) {
    if (!seen[door.segment] && !seen[door.child]) continue;
    const color = colorOf(door);
    const q = door.quad.map((v) => v.clone().lerp(door.center, AUTOMAP_STYLE.doorInset));
    for (let k = 0; k < 4; k++) pushLine(out, q[k], q[(k + 1) % 4], color);
    pushLine(out, q[0], q[2], color);
    pushLine(out, q[1], q[3], color);
  }
  return out;
}

function pushLine(out: MapLines, a: Vector3, b: Vector3, color: Color): void {
  out.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  out.colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
}

/** Centre of the seen segments' bounding box and its radius, to frame the map. */
export function seenBounds(level: Level, seen: readonly boolean[], out = new Vector3()): { center: Vector3; radius: number } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const seg of level.segments) {
    if (!seen[seg.index]) continue;
    for (const v of seg.verts) {
      _p.copy(level.vertices[v]);
      min.min(_p);
      max.max(_p);
    }
  }
  if (min.x === Infinity) return { center: out.set(0, 0, 0), radius: 0 };
  out.addVectors(min, max).multiplyScalar(0.5);
  return { center: out, radius: min.distanceTo(max) / 2 };
}
