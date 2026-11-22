import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

/** Accumulates non-indexed, flat-shaded triangles with per-vertex colour. */
export class GeometrySink {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  private readonly ab = new Vector3();
  private readonly ac = new Vector3();
  private readonly n = new Vector3();

  /**
   * Adds a triangle wound to face `inside`. Returns true when it swapped `b`
   * and `c` to do so (vertices were stored as a, c, b), so subclasses can keep
   * extra per-vertex data in the same order.
   */
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color, inside: Vector3): boolean {
    this.n.crossVectors(this.ab.subVectors(b, a), this.ac.subVectors(c, a));
    const flipped = this.n.dot(this.ab.subVectors(inside, a)) < 0;
    if (flipped) {
      [b, c] = [c, b];
      this.n.negate();
    }
    this.n.normalize();
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.col.push(color.r, color.g, color.b);
    }
    return flipped;
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, inside: Vector3): void {
    this.tri(a, b, c, color, inside);
    this.tri(a, c, d, color, inside);
  }

  toGeometry(withNormals: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    if (withNormals) g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Deterministic PRNG so the level looks the same every load. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

