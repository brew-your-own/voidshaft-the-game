import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial, Vector3,
} from 'three';

export interface ParticleSpec {
  position: Vector3;
  velocity: Vector3;
  color: Color;
  life: number;
  /** Fraction of velocity kept per second (1 = no drag). */
  drag?: number;
}

const HIDDEN = 1e6;

/** Fixed-size pool of additive glowing points (sparks, embers, smoke). */
export class Particles {
  readonly object: Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly base: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;

  constructor(private readonly capacity = 3000) {
    this.pos = new Float32Array(capacity * 3).fill(HIDDEN);
    this.col = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.drag = new Float32Array(capacity).fill(1);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(this.pos, 3));
    geom.setAttribute('color', new BufferAttribute(this.col, 3));
    const material = new PointsMaterial({
      size: 0.35,
      map: makeDotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      sizeAttenuation: true,
    });
    this.object = new Points(geom, material);
    this.object.frustumCulled = false;
  }

  emit(s: ParticleSpec): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const o = i * 3;
    this.pos[o] = s.position.x; this.pos[o + 1] = s.position.y; this.pos[o + 2] = s.position.z;
    this.vel[o] = s.velocity.x; this.vel[o + 1] = s.velocity.y; this.vel[o + 2] = s.velocity.z;
    this.base[o] = s.color.r; this.base[o + 1] = s.color.g; this.base[o + 2] = s.color.b;
    this.life[i] = s.life;
    this.maxLife[i] = s.life;
    this.drag[i] = s.drag ?? 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const o = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[o] = this.pos[o + 1] = this.pos[o + 2] = HIDDEN;
        this.col[o] = this.col[o + 1] = this.col[o + 2] = 0;
        continue;
      }
      const k = Math.pow(this.drag[i], dt);
      this.vel[o] *= k; this.vel[o + 1] *= k; this.vel[o + 2] *= k;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      const fade = f * f;
      this.col[o] = this.base[o] * fade;
      this.col[o + 1] = this.base[o + 1] * fade;
      this.col[o + 2] = this.base[o + 2] * fade;
    }
    const g = this.object.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

function makeDotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}
