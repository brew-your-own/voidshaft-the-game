import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

/** Accumulates non-indexed, flat-shaded triangles with per-vertex colour. */
export class GeometrySink {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  private readonly ab = new Vector3();
  private readonly ac = new Vector3();
  private readonly n = new Vector3();

  /** Adds a triangle wound to face `inside`. */
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color, inside: Vector3): void {
    this.n.crossVectors(this.ab.subVectors(b, a), this.ac.subVectors(c, a));
    if (this.n.dot(this.ab.subVectors(inside, a)) < 0) {
      [b, c] = [c, b];
      this.n.negate();
    }
    this.n.normalize();
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.col.push(color.r, color.g, color.b);
    }
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

