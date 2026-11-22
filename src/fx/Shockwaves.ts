import {
  AdditiveBlending, Color, DoubleSide, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial,
  Quaternion, ShaderMaterial, TorusGeometry, Vector3,
} from 'three';

interface Wave {
  active: boolean;
  readonly center: Vector3;
  readonly ringRotation: Quaternion;
  readonly color: Color;
  startRadius: number;
  endRadius: number;
  time: number;
  life: number;
}

/**
 * Fresnel shell: bright at the silhouette, see-through in the middle. It
 * fades out as the camera nears or enters it; otherwise a blast next to the
 * ship fills the whole screen with rim and whites it out.
 */
const SHELL_VERTEX = /* glsl */ `
varying vec3 vColor;
varying float vRim;
varying float vNear;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  float radius = length(instanceMatrix[0].xyz);
  float dist = length((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  vNear = smoothstep(radius * 1.2, radius * 3.0, dist);
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.0);
#endif
  gl_Position = projectionMatrix * mv;
}`;

const SHELL_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vRim;
varying float vNear;
void main() {
  float r = vRim * vRim;
  gl_FragColor = vec4(vColor * (0.08 + r * r * 1.6) * vNear, 1.0);
}`;

const _m = new Matrix4();
const _s = new Vector3();
const _q = new Quaternion();
const _black = new Color(0, 0, 0);
const _c = new Color();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/**
 * Expanding blast shells and rings, pooled. Two InstancedMeshes (shell and
 * ring) with additive materials; fading is done by darkening the instance
 * colour, which with additive blending is the same as lowering opacity.
 * Every instance is always drawn (unused ones at zero scale), so both
 * shaders compile in the warm-up render.
 */
export class Shockwaves {
  readonly object = new Group();
  private readonly waves: Wave[];
  private readonly shell: InstancedMesh;
  private readonly ring: InstancedMesh;

  constructor(readonly capacity = 8) {
    this.waves = Array.from({ length: capacity }, () => ({
      active: false, center: new Vector3(), ringRotation: new Quaternion(), color: new Color(),
      startRadius: 0, endRadius: 1, time: 0, life: 1,
    }));
    const shellMat = new ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const ringMat = new MeshBasicMaterial({
      color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false,
      side: DoubleSide, toneMapped: false, fog: false,
    });
    this.shell = new InstancedMesh(new IcosahedronGeometry(1, 2), shellMat, capacity);
    this.ring = new InstancedMesh(new TorusGeometry(1, 0.035, 4, 40), ringMat, capacity);
    for (const mesh of [this.shell, this.ring]) {
      mesh.frustumCulled = false;
      // Drawn after opaque geometry; colour attribute created up front.
      mesh.renderOrder = 2;
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, _black);
      }
      this.object.add(mesh);
    }
  }

  get activeCount(): number {
    return this.waves.reduce((n, w) => n + (w.active ? 1 : 0), 0);
  }

  /** Starts a wave growing from `startRadius` to `endRadius` over `life` s. */
  spawn(pos: Vector3, startRadius: number, endRadius: number, life: number, color: Color, rng: () => number = Math.random): void {
    let slot = this.waves[0];
    let best = Infinity;
    for (const w of this.waves) {
      const remaining = w.active ? w.life - w.time : -1;
      if (remaining < best) { best = remaining; slot = w; }
    }
    slot.active = true;
    slot.center.copy(pos);
    slot.ringRotation.set(rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    slot.color.copy(color);
    slot.startRadius = startRadius;
    slot.endRadius = endRadius;
    slot.time = 0;
    slot.life = life;
  }

  /**
   * Where the camera is, if known: the ring fades as the camera nears the
   * blast (the shell does the same in its shader), so a blast next to the
   * ship doesn't white out the screen.
   */
  viewer: Vector3 | null = null;

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (!w.active) continue;
      dirty = true;
      w.time += dt;
      if (w.time >= w.life) {
        w.active = false;
        this.shell.setMatrixAt(i, ZERO);
        this.ring.setMatrixAt(i, ZERO);
        continue;
      }
      const p = w.time / w.life;
      const ease = 1 - (1 - p) * (1 - p) * (1 - p);
      const radius = w.startRadius + (w.endRadius - w.startRadius) * ease;
      const fade = (1 - p) * (1 - p);

      _s.setScalar(radius);
      _m.compose(w.center, _q.identity(), _s);
      this.shell.setMatrixAt(i, _m);
      // Hot white at first, cooling to the explosion's colour.
      _c.setRGB(1, 1, 1).multiplyScalar((w.color.r + w.color.g + w.color.b) / 2).lerp(w.color, Math.min(1, p * 3));
      this.shell.setColorAt(i, _c.multiplyScalar(fade));

      _s.setScalar(radius * 1.2);
      _m.compose(w.center, w.ringRotation, _s);
      this.ring.setMatrixAt(i, _m);
      const near = this.viewer ? nearFade(this.viewer.distanceTo(w.center), radius * 1.2) : 1;
      this.ring.setColorAt(i, _c.copy(w.color).multiplyScalar(fade * 1.4 * near));
    }
    if (!dirty) return;
    for (const mesh of [this.shell, this.ring]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}

/** 0 with the camera inside 1.2 radii of the blast, 1 beyond 3 radii (smoothstep). */
export function nearFade(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, (distance - radius * 1.2) / (radius * 1.8)));
  return t * t * (3 - 2 * t);
}
