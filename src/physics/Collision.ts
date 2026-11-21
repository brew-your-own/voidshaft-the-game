import { Vector3 } from 'three';
import { closestPointOnTriangle } from '../level/geometry';
import type { Level } from '../level/Level';

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
  const tris = level.nearWalls(seg);
  const result: CollisionResult = { hit: false, impactSpeed: 0 };
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const t of tris) {
      // Only walls the centre is in front of. Walls of neighbouring segments
      // that lie behind us (around portal corners) must not push. Steps are
      // short relative to the radius, so the centre never crosses a wall.
      const planeDist = t.n.dot(pos) + t.d;
      if (planeDist > radius || planeDist < 0) continue;
      closestPointOnTriangle(pos, t.a, t.b, t.c, _closest);
      _delta.subVectors(pos, _closest);
      const dist = _delta.length();
      if (dist >= radius) continue;
      if (dist < 1e-6) _n.copy(t.n);
      else _n.copy(_delta).multiplyScalar(1 / dist);
      const depth = radius - dist;
      pos.addScaledVector(_n, depth);
      const vn = vel.dot(_n);
      if (vn < 0) {
        vel.addScaledVector(_n, -vn * (1 + bounce));
        result.impactSpeed = Math.max(result.impactSpeed, -vn);
      }
      result.hit = true;
      moved = true;
    }
    if (!moved) break;
  }
  return result;
}
