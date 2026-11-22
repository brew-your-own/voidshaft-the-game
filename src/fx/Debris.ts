import {
  BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3,
} from 'three';

export const DEBRIS_TUNING = {
  /** Chunks alive at once; the oldest is recycled when full. */
  capacity: 64,
  /** Seconds a chunk lives (random in range). */
  life: [1.8, 2.8] as [number, number],
  /** Seconds at the end of life during which a chunk shrinks away. */
  fade: 0.6,
  /** Fraction of velocity kept per second. */
  drag: 0.55,
  /** Collision sphere radius as a fraction of the chunk's size. */
  radiusScale: 0.6,
  /** Restitution off walls (0 = slide, 1 = perfect bounce). */
  bounce: 0.45,
  /** Spin kept per bounce. */
  bounceSpin: 0.7,
  /** Longest integration step, so fast chunks don't tunnel through walls. */
  maxStep: 1 / 90,
};

/**
 * Moves a chunk out of walls. Returns the chunk's segment afterwards, or -1
 * if it left the level (the chunk is then dropped).
 */
export type DebrisCollider = (pos: Vector3, vel: Vector3, radius: number, segment: number) => number;

export interface DebrisChunk {
  active: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Quaternion;
  readonly spinAxis: Vector3;
  spinRate: number;
  /** Non-uniform scale, so chunks look different from one mesh. */
  readonly scale: Vector3;
  size: number;
  life: number;
  maxLife: number;
  segment: number;
  /** Time since spawn. */
  age: number;
}

const _q = new Quaternion();

/** Fixed-size pool of tumbling hull chunks. Pure logic: no rendering. */
export class DebrisPool {
  readonly chunks: DebrisChunk[];

  constructor(readonly capacity = DEBRIS_TUNING.capacity) {
    this.chunks = Array.from({ length: capacity }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      rotation: new Quaternion(),
      spinAxis: new Vector3(0, 1, 0),
      spinRate: 0,
      scale: new Vector3(1, 1, 1),
      size: 0,
      life: 0,
      maxLife: 1,
      segment: -1,
      age: 0,
    }));
  }

  get activeCount(): number {
    let n = 0;
    for (const c of this.chunks) if (c.active) n++;
    return n;
  }

  /** Starts a chunk, reusing a free slot or the one nearest its end. */
  spawn(pos: Vector3, vel: Vector3, size: number, segment: number, rng: () => number = Math.random): DebrisChunk {
    let slot = this.chunks[0];
    let best = Infinity;
    for (const c of this.chunks) {
      const remaining = c.active ? c.life : -1;
      if (remaining < best) { best = remaining; slot = c; }
      if (remaining < 0) break;
    }
    const t = DEBRIS_TUNING;
    slot.active = true;
    slot.position.copy(pos);
    slot.velocity.copy(vel);
    slot.rotation.set(rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    slot.spinAxis.set(rng() - 0.5, rng() - 0.5, rng() - 0.5);
    if (slot.spinAxis.lengthSq() < 1e-6) slot.spinAxis.set(0, 1, 0);
    slot.spinAxis.normalize();
    slot.spinRate = 4 + rng() * 10;
    slot.size = size;
    slot.scale.set(size * (0.7 + rng() * 0.8), size * (0.35 + rng() * 0.4), size * (0.7 + rng() * 0.8));
    slot.maxLife = slot.life = t.life[0] + rng() * (t.life[1] - t.life[0]);
    slot.segment = segment;
    slot.age = 0;
    return slot;
  }

  /** Moves, spins and expires chunks; bounces them off walls when `collide` is given. */
  update(dt: number, collide?: DebrisCollider): void {
    if (dt <= 0) return;
    const t = DEBRIS_TUNING;
    const steps = Math.max(1, Math.ceil(dt / t.maxStep));
    const h = dt / steps;
    const keep = Math.pow(t.drag, h);
    for (const c of this.chunks) {
      if (!c.active) continue;
      c.life -= dt;
      c.age += dt;
      if (c.life <= 0) { c.active = false; continue; }
      for (let i = 0; i < steps && c.active; i++) {
        c.velocity.multiplyScalar(keep);
        c.position.addScaledVector(c.velocity, h);
        if (collide && c.segment >= 0) {
          const before = c.velocity.lengthSq();
          const seg = collide(c.position, c.velocity, c.size * t.radiusScale, c.segment);
          if (seg < 0) c.active = false;
          else c.segment = seg;
          // A hit changed the velocity: lose some spin and pick a new axis.
          if (c.active && Math.abs(c.velocity.lengthSq() - before) > 1e-6) {
            c.spinRate *= t.bounceSpin;
            c.spinAxis.set(c.velocity.y, -c.velocity.z, c.velocity.x).normalize();
            if (!Number.isFinite(c.spinAxis.x)) c.spinAxis.set(0, 1, 0);
          }
        }
      }
      _q.setFromAxisAngle(c.spinAxis, c.spinRate * dt);
      c.rotation.premultiply(_q);
    }
  }

  /** Display scale factor: 1, shrinking to 0 over the last `fade` seconds. */
  static fadeScale(c: DebrisChunk): number {
    if (!c.active) return 0;
    return Math.min(1, c.life / DEBRIS_TUNING.fade);
  }

  clear(): void {
    for (const c of this.chunks) c.active = false;
  }
}

const _m = new Matrix4();
const _s = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/**
 * Renders a DebrisPool as one InstancedMesh with a single shared material.
 * All instances are always drawn (unused ones at zero scale), so the shader
 * compiles during the game's warm-up render and never changes afterwards.
 */
export class DebrisRenderer {
  readonly mesh: InstancedMesh;

  constructor(readonly pool: DebrisPool) {
    const material = new MeshStandardMaterial({
      color: 0xffffff, flatShading: true, metalness: 0.45, roughness: 0.5,
      emissive: 0x0c0a14,
    });
    this.mesh = new InstancedMesh(makeShardGeometry(), material, pool.capacity);
    this.mesh.frustumCulled = false;
    // Create the colour attribute now: adding it later would recompile.
    const grey = new Color(0x55506a);
    for (let i = 0; i < pool.capacity; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, grey);
    }
  }

  /** Sets the tint of the chunk in `slot` (index into pool.chunks). */
  setColor(slot: number, color: Color): void {
    this.mesh.setColorAt(slot, color);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  sync(): void {
    const chunks = this.pool.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const f = DebrisPool.fadeScale(c);
      if (f <= 0) { this.mesh.setMatrixAt(i, ZERO); continue; }
      _s.copy(c.scale).multiplyScalar(f);
      _m.compose(c.position, c.rotation, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** An irregular, flattened octahedron: reads as a torn hull plate. */
function makeShardGeometry(): BufferGeometry {
  const v = [
    [0.0, 0.55, 0.1], [0.0, -0.45, -0.05], // top, bottom
    [0.75, 0.05, 0.0], [-0.6, -0.05, 0.15], // right, left
    [0.1, 0.0, 0.8], [-0.05, 0.1, -0.55], // front, back
  ];
  const faces = [
    [0, 4, 2], [0, 2, 5], [0, 5, 3], [0, 3, 4],
    [1, 2, 4], [1, 5, 2], [1, 3, 5], [1, 4, 3],
  ];
  const pos = new Float32Array(faces.length * 9);
  faces.forEach((f, i) => f.forEach((vi, j) => pos.set(v[vi], i * 9 + j * 3)));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
