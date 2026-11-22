import { ACESFilmicToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HitFlashPass } from './HitFlashPass';

/** Highest device pixel ratio we render at; beyond 2 the cost isn't worth it. */
const MAX_PIXEL_RATIO = 2;

export interface RenderContext {
  renderer: WebGLRenderer;
  composer: EffectComposer;
  /** The scene pass; its scene and camera can be swapped (the automap does). */
  renderPass: RenderPass;
  bloom: UnrealBloomPass;
  /** Damage vignette and colour fringe; off (free) when not flashing. */
  hitFlash: HitFlashPass;
  resize(): void;
  /** Renders at `scale` × the native pixel ratio (capped at 2). */
  setScale(scale: number): void;
  /** Current pixel ratio as a fraction of the native one. */
  readonly scale: number;
}

export function createRenderer(canvas: HTMLCanvasElement, scene: Scene, camera: PerspectiveCamera): RenderContext {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Counted per frame by the game (the composer renders several passes).
  renderer.info.autoReset = false;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.7, 0.5, 0.92);
  composer.addPass(bloom);
  // After bloom, before tone mapping: works on the HDR image.
  const hitFlash = new HitFlashPass();
  composer.addPass(hitFlash);
  composer.addPass(new OutputPass());
  let scale = 1;
  const native = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = native() * scale;
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  return {
    renderer, composer, renderPass, bloom, hitFlash, resize,
    setScale(s: number) {
      if (s === scale) return;
      scale = s;
      resize();
    },
    get scale() { return scale; },
  };
}
