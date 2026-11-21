import { Vector3 } from 'three';
import { BOX_SIGNS, OPPOSITE, SIDE_VERTS, partnerVertex } from './geometry';
import type { DoorData, KeyColor, KeyData, LevelData, LightData, SegmentData, Vec3 } from './types';

export interface ExtrudeOptions {
  /** Distance the new face is pushed out along the side's outward normal. */
  length: number;
  /** Scale of the new face around its centre (1 = same size). */
  scale?: number;
  /** Extra world-space offset applied to the new face (ramps, bends). */
  shift?: Vec3;
  /** Accent colour; defaults to the parent's. */
  color?: number;
}

/**
 * Small DSL for authoring cube-segment levels in code: start with a box,
 * then grow tunnels by extruding sides.
 */
export class LevelBuilder {
  readonly vertices: Vector3[] = [];
  readonly segments: SegmentData[] = [];
  private readonly lights: LightData[] = [];
  private readonly doors: DoorData[] = [];
  private readonly keys: KeyData[] = [];

  addBox(center: Vec3, size: Vec3, color: number): number {
    const verts = BOX_SIGNS.map(([sx, sy, sz]) =>
      this.addVertex(new Vector3(
        center[0] + (sx * size[0]) / 2,
        center[1] + (sy * size[1]) / 2,
        center[2] + (sz * size[2]) / 2,
      )),
    );
    return this.addSegment(verts, color);
  }

  extrude(seg: number, side: number, opts: ExtrudeOptions): number {
    const parent = this.segments[seg];
    if (parent.children[side] !== -1) {
      throw new Error(`Segment ${seg} side ${side} is already connected`);
    }
    const sideVerts = SIDE_VERTS[side];
    const quad = sideVerts.map((lv) => this.vertices[parent.verts[lv]]);
    const faceCenter = quad.reduce((acc, v) => acc.add(v), new Vector3()).multiplyScalar(0.25);
    const normal = this.outwardNormal(seg, quad, faceCenter);
    const scale = opts.scale ?? 1;
    const shift = new Vector3(...(opts.shift ?? [0, 0, 0]));

    const verts = new Array<number>(8);
    for (const lv of sideVerts) {
      const shared = parent.verts[lv];
      verts[partnerVertex(side, lv)] = shared;
      const p = this.vertices[shared].clone().sub(faceCenter).multiplyScalar(scale)
        .add(faceCenter).addScaledVector(normal, opts.length).add(shift);
      verts[lv] = this.addVertex(p);
    }
    const child = this.addSegment(verts, opts.color ?? parent.color);
    parent.children[side] = child;
    this.segments[child].children[OPPOSITE[side]] = seg;
    return child;
  }

  /** Chain several extrusions along the same side. Returns the last segment. */
  tunnel(seg: number, side: number, steps: ExtrudeOptions[]): number {
    return steps.reduce((s, opts) => this.extrude(s, side, opts), seg);
  }

  addLight(seg: number, color: number, intensity = 40, distance = 30, offset: Vec3 = [0, 0, 0]): void {
    const c = this.center(seg);
    this.lights.push({
      position: [c.x + offset[0], c.y + offset[1], c.z + offset[2]],
      color, intensity, distance,
    });
  }

  /** Places a door in an existing portal. */
  door(seg: number, side: number, key: KeyColor | null = null): void {
    if (this.segments[seg].children[side] < 0) {
      throw new Error(`Segment ${seg} side ${side} is a wall, not a portal`);
    }
    const child = this.segments[seg].children[side];
    const taken = this.doors.some((d) =>
      (d.segment === seg && d.side === side) ||
      (d.segment === child && d.side === OPPOSITE[side]));
    if (taken) throw new Error(`Portal ${seg}:${side} already has a door`);
    this.doors.push({ segment: seg, side, key });
  }

  /** Places a key pickup at the segment centre (plus offset). */
  key(seg: number, color: KeyColor, offset: Vec3 = [0, 0, 0]): void {
    const c = this.center(seg);
    this.keys.push({ color, segment: seg, position: [c.x + offset[0], c.y + offset[1], c.z + offset[2]] });
  }

  center(seg: number): Vector3 {
    return this.segments[seg].verts
      .reduce((acc, i) => acc.add(this.vertices[i]), new Vector3())
      .multiplyScalar(1 / 8);
  }

  build(name: string, startSeg: number, forward: Vec3): LevelData {
    const c = this.center(startSeg);
    return {
      name,
      vertices: this.vertices.map((v) => [v.x, v.y, v.z] as Vec3),
      segments: this.segments.map((s) => ({ ...s, verts: [...s.verts], children: [...s.children] })),
      playerStart: { segment: startSeg, position: [c.x, c.y, c.z], forward },
      lights: [...this.lights],
      doors: [...this.doors],
      keys: [...this.keys],
    };
  }

  private outwardNormal(seg: number, quad: Vector3[], faceCenter: Vector3): Vector3 {
    const n = new Vector3()
      .subVectors(quad[2], quad[0])
      .cross(new Vector3().subVectors(quad[3], quad[1]))
      .normalize();
    if (n.dot(new Vector3().subVectors(faceCenter, this.center(seg))) < 0) n.negate();
    return n;
  }

  private addVertex(v: Vector3): number {
    this.vertices.push(v);
    return this.vertices.length - 1;
  }

  private addSegment(verts: number[], color: number): number {
    this.segments.push({ verts, children: [-1, -1, -1, -1, -1, -1], color });
    return this.segments.length - 1;
  }
}
