import { type PerspectiveCamera, Vector3 } from 'three';
import type { Level } from '../level/Level';

/** Screen-space rectangle in normalised device coordinates. */
interface Rect { x0: number; y0: number; x1: number; y1: number }

const FULL: Rect = { x0: -1, y0: -1, x1: 1, y1: 1 };
const MAX_VISITS = 2000;
/** Closer than this to a portal plane, skip projection and pass the whole parent rect. */
const NEAR_PORTAL = 0.4;

const _v = new Vector3();

/**
 * Portal visibility: flood from the camera's segment through open portals,
 * narrowing a screen rectangle at each portal. Segments never reached are
 * hidden.
 */
export class PortalCuller {
  readonly visible: boolean[];
  private readonly rects: (Rect | null)[];

  constructor(private readonly level: Level) {
    this.visible = level.segments.map(() => true);
    this.rects = level.segments.map(() => null);
  }

  /**
   * @param isOpen whether the portal on `side` of `seg` can be seen through
   *   (closed doors block sight).
   */
  compute(camera: PerspectiveCamera, startSeg: number, isOpen: (seg: number, side: number) => boolean): boolean[] {
    const { segments } = this.level;
    this.rects.fill(null);
    if (startSeg < 0) {
      this.visible.fill(true);
      return this.visible;
    }
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse;
    const proj = camera.projectionMatrix;
    const camPos = camera.position;

    this.rects[startSeg] = { ...FULL };
    const queue = [startSeg];
    let visits = 0;
    while (queue.length && visits++ < MAX_VISITS) {
      const s = queue.pop()!;
      const r = this.rects[s]!;
      const seg = segments[s];
      for (let side = 0; side < 6; side++) {
        const c = seg.children[side];
        if (c < 0 || !isOpen(s, side)) continue;
        const sideGeom = seg.sides[side];
        // Portal planes face into `s`; from behind we can't look through.
        const t0 = sideGeom.tris[0], t1 = sideGeom.tris[1];
        const dist = Math.max(t0.n.dot(camPos) + t0.d, t1.n.dot(camPos) + t1.d);
        if (dist < -0.01) continue;

        let pr: Rect | null;
        if (dist < NEAR_PORTAL) pr = { ...r };
        else pr = projectPortal(sideGeom.quad, view, proj, r);
        if (!pr) continue;

        const existing = this.rects[c];
        if (!existing) {
          this.rects[c] = pr;
          queue.push(c);
        } else if (pr.x0 < existing.x0 || pr.y0 < existing.y0 || pr.x1 > existing.x1 || pr.y1 > existing.y1) {
          existing.x0 = Math.min(existing.x0, pr.x0);
          existing.y0 = Math.min(existing.y0, pr.y0);
          existing.x1 = Math.max(existing.x1, pr.x1);
          existing.y1 = Math.max(existing.y1, pr.y1);
          queue.push(c);
        }
      }
    }
    for (let i = 0; i < segments.length; i++) this.visible[i] = this.rects[i] !== null;
    return this.visible;
  }
}

/** Screen bounds of a portal quad clipped to `clip`, or null if empty. */
function projectPortal(
  quad: Vector3[], view: PerspectiveCamera['matrixWorldInverse'],
  proj: PerspectiveCamera['projectionMatrix'], clip: Rect,
): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let behind = 0;
  for (const p of quad) {
    _v.copy(p).applyMatrix4(view);
    if (_v.z > -0.05) { behind++; continue; }
    _v.applyMatrix4(proj);
    x0 = Math.min(x0, _v.x); y0 = Math.min(y0, _v.y);
    x1 = Math.max(x1, _v.x); y1 = Math.max(y1, _v.y);
  }
  if (behind === 4) return null;
  // Partly behind the camera: projection is unreliable, stay conservative.
  if (behind > 0) return { ...clip };
  const r = {
    x0: Math.max(x0, clip.x0), y0: Math.max(y0, clip.y0),
    x1: Math.min(x1, clip.x1), y1: Math.min(y1, clip.y1),
  };
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
}
