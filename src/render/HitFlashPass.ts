import { Color, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const HIT_FLASH_TUNING = {
  /** Seconds for a full-strength flash to fade out. */
  duration: 0.3,
  /** Strength of a hit: base plus per point of damage, capped at 1. */
  base: 0.35,
  perPoint: 0.03,
  /** Edge tint (linear, before tone mapping). */
  color: 0xff2a4d,
  tint: 1.4,
  /** Colour-fringe offset at the screen corners, as a fraction of the screen. */
  fringe: 0.012,
};

/** Strength (0–1) of the flash for one hit of `amount` damage. */
export function hitFlashStrength(amount: number): number {
  const t = HIT_FLASH_TUNING;
  return amount > 0 ? Math.min(1, t.base + amount * t.perPoint) : 0;
}

const HitFlashShader = {
  name: 'HitFlashShader',
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    fringe: { value: HIT_FLASH_TUNING.fringe },
    color: { value: new Color(HIT_FLASH_TUNING.color).multiplyScalar(HIT_FLASH_TUNING.tint) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float fringe;
    uniform vec3 color;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      // 0 in the middle of the screen, 1 at the corners.
      float edge = smoothstep(0.2, 0.75, length(c) * 1.4142);
      vec2 off = c * (fringe * strength * edge * 2.0);
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, base.g, texture2D(tDiffuse, vUv - off).b);
      col += color * (edge * edge * strength);
      gl_FragColor = vec4(col, base.a);
    }`,
};

/**
 * Damage feedback as a post pass: a vignette in the damage colour plus a
 * colour fringe towards the screen edges, fading over ~0.3 s. It turns
 * itself off at strength 0, so it costs nothing when idle. It starts
 * enabled so the first composer render (the game's warm-up) compiles it.
 */
export class HitFlashPass extends ShaderPass {
  private level = 0;

  constructor() {
    super(HitFlashShader);
  }

  get strength(): number {
    return this.level;
  }

  /** Starts (or tops up) a flash of `strength` 0–1. */
  flash(strength: number): void {
    if (!(strength > 0)) return;
    this.level = Math.min(1, Math.max(this.level, strength));
    this.enabled = true;
  }

  /** Fades the flash; call once per frame. */
  update(dt: number): void {
    if (this.level <= 0) return;
    this.level = Math.max(0, this.level - dt / HIT_FLASH_TUNING.duration);
  }

  override render(
    renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean,
  ): void {
    const s = this.level;
    this.uniforms.strength.value = s * s;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    if (s <= 0) this.enabled = false;
  }
}
