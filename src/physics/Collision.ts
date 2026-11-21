import { Vector3 } from 'three';
import { closestPointOnTriangle } from '../level/geometry';
import type { Level, Tri } from '../level/Level';

const _closest = new Vector3();
const _delta = new Vector3();
const _n = new Vector3();

export interface CollisionResult {
  hit: boolean;
  /** Largest speed lost into a wall this step (for impact effects). */
  impactSpeed: number;
}

/**
 * Pushes a sphere out of nearby wall triangles and removes the velocity
 * component going into the wall, so the body slides along surfaces.
 */
export function collideSphere(
  level: Level, seg: number, pos: Vector3, vel: Vector3, radius: number,
  bounce = 0.15, iterations = 4,
): CollisionResult {
  const walls = level.nearWalls(seg);
  const doors = level.nearDoors(seg);
  const result: CollisionResult = { hit: false, impactSpeed: 0 };
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const t of walls) moved = pushOut(t, pos, vel, radius, bounce, result) || moved;
    for (const d of doors) {
      if (!d.solid) continue;
      for (const t of d.tris) moved = pushOut(t, pos, vel, radius, bounce, result) || moved;
    }
    if (!moved) break;
  }
  return result;
}

/** Distance from p to the nearest of the given triangles. */
export function distanceToTris(p: Vector3, tris: readonly Tri[]): number {
  let min = Infinity;
  for (const t of tris) min = Math.min(min, closestPointOnTriangle(p, t.a, t.b, t.c, _closest).distanceTo(p));
  return min;
}

function pushOut(
  t: Tri, pos: Vector3, vel: Vector3, radius: number, bounce: number, result: CollisionResult,
): boolean {
  // Only walls the centre is in front of. Walls of neighbouring segments
  // that lie behind us (around portal corners) must not push. Steps are
  // short relative to the radius, so the centre never crosses a wall.
  const planeDist = t.n.dot(pos) + t.d;
  if (planeDist > radius || planeDist < 0) return false;
  closestPointOnTriangle(pos, t.a, t.b, t.c, _closest);
  _delta.subVectors(pos, _closest);
  const dist = _delta.length();
  if (dist >= radius) return false;
  if (dist < 1e-6) _n.copy(t.n);
  else _n.copy(_delta).multiplyScalar(1 / dist);
  pos.addScaledVector(_n, radius - dist);
  const vn = vel.dot(_n);
  if (vn < 0) {
    vel.addScaledVector(_n, -vn * (1 + bounce));
    result.impactSpeed = Math.max(result.impactSpeed, -vn);
  }
  result.hit = true;
  return true;
}
