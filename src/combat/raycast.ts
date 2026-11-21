import { Vector3 } from 'three';
import type { Level, Tri } from '../level/Level';

export interface RayHit {
  /** Fraction along p0→p1 where the hit occurs. */
  t: number;
  normal: Vector3;
}

const _e1 = new Vector3();
const _e2 = new Vector3();
const _p = new Vector3();
const _s = new Vector3();
const _q = new Vector3();
const _d = new Vector3();

/** Möller–Trumbore segment/triangle test. Returns t ∈ [0, 1] or -1. */
export function segmentTriangle(p0: Vector3, p1: Vector3, tri: Tri): number {
  _d.subVectors(p1, p0);
  _e1.subVectors(tri.b, tri.a);
  _e2.subVectors(tri.c, tri.a);
  _p.crossVectors(_d, _e2);
  const det = _e1.dot(_p);
  if (Math.abs(det) < 1e-9) return -1;
  const inv = 1 / det;
  _s.subVectors(p0, tri.a);
  const u = _s.dot(_p) * inv;
  if (u < 0 || u > 1) return -1;
  _q.crossVectors(_s, _e1);
  const v = _d.dot(_q) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = _e2.dot(_q) * inv;
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * First wall or closed door hit by the segment p0→p1, searching walls near
 * `seg`. Only front faces count (a ray leaving through a wall's back is
 * ignored), which matches how walls face into their segment.
 */
export function sweepWalls(level: Level, seg: number, p0: Vector3, p1: Vector3): RayHit | null {
  let best: RayHit | null = null;
  const dir = _d.clone().subVectors(p1, p0);
  const test = (tri: Tri) => {
    if (tri.n.dot(dir) >= 0) return;
    const t = segmentTriangle(p0, p1, tri);
    if (t >= 0 && (!best || t < best.t)) best = { t, normal: tri.n };
  };
  for (const tri of level.nearWalls(seg)) test(tri);
  for (const door of level.nearDoors(seg)) if (door.solid) for (const tri of door.tris) test(tri);
  return best;
}

/** Fraction along p0→p1 where it first enters the sphere, or -1. */
export function segmentSphere(p0: Vector3, p1: Vector3, center: Vector3, radius: number): number {
  _d.subVectors(p1, p0);
  _s.subVectors(p0, center);
  const a = _d.lengthSq();
  const c = _s.lengthSq() - radius * radius;
  if (c <= 0) return 0; // starts inside
  if (a < 1e-12) return -1;
  const b = _s.dot(_d);
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}
