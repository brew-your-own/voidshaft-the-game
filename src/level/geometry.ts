import { Vector3 } from 'three';

export const SIDE = { LEFT: 0, RIGHT: 1, BOTTOM: 2, TOP: 3, BACK: 4, FRONT: 5 } as const;
export type Side = (typeof SIDE)[keyof typeof SIDE];

/** Vertices of each side, in cyclic order around the quad. */
export const SIDE_VERTS: readonly (readonly [number, number, number, number])[] = [
  [0, 4, 7, 3], // LEFT
  [1, 2, 6, 5], // RIGHT
  [0, 1, 5, 4], // BOTTOM
  [3, 7, 6, 2], // TOP
  [0, 3, 2, 1], // BACK
  [4, 5, 6, 7], // FRONT
];

export const OPPOSITE: readonly number[] = [1, 0, 3, 2, 5, 4];

const AXIS_OF_SIDE = [0, 0, 1, 1, 2, 2];
/** For each axis, the vertex across the cube along that axis. */
const PARTNER: readonly (readonly number[])[] = [
  [1, 0, 3, 2, 5, 4, 7, 6], // x
  [3, 2, 1, 0, 7, 6, 5, 4], // y
  [4, 5, 6, 7, 0, 1, 2, 3], // z
];

export function partnerVertex(side: number, localVertex: number): number {
  return PARTNER[AXIS_OF_SIDE[side]][localVertex];
}

/** Signs used to build an axis-aligned box. */
export const BOX_SIGNS: readonly Vec3Signs[] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
type Vec3Signs = [number, number, number];

const _ab = new Vector3();
const _ac = new Vector3();
const _ap = new Vector3();
const _bp = new Vector3();
const _cp = new Vector3();

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestPointOnTriangle(
  p: Vector3, a: Vector3, b: Vector3, c: Vector3, out: Vector3,
): Vector3 {
  _ab.subVectors(b, a);
  _ac.subVectors(c, a);
  _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap);
  const d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp);
  const d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return out.copy(a).addScaledVector(_ab, d1 / (d1 - d3));
  }

  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp);
  const d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return out.copy(a).addScaledVector(_ac, d2 / (d2 - d6));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return out.copy(c).sub(b).multiplyScalar(w).add(b);
  }

  const denom = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(_ab, vb * denom).addScaledVector(_ac, vc * denom);
}

/** Bilinear point on quad q0..q3 (q0→q1 is u, q0→q3 is v). */
export function bilerp(q: readonly Vector3[], u: number, v: number, out = new Vector3()): Vector3 {
  const ax = q[0].x + (q[1].x - q[0].x) * u, ay = q[0].y + (q[1].y - q[0].y) * u, az = q[0].z + (q[1].z - q[0].z) * u;
  const bx = q[3].x + (q[2].x - q[3].x) * u, by = q[3].y + (q[2].y - q[3].y) * u, bz = q[3].z + (q[2].z - q[3].z) * u;
  return out.set(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v);
}
