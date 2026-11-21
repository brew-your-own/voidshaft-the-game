import { Color, FogExp2, HemisphereLight, PerspectiveCamera, PointLight, Scene } from 'three';
import { Input, type FlightControls } from '../input/Input';
import { Level } from '../level/Level';
import { buildLevelMesh } from '../level/LevelMesh';
import type { LevelData } from '../level/types';
import { Ship } from '../physics/Ship';
import { createRenderer, type RenderContext } from '../render/Renderer';
import { HUD } from '../ui/HUD';

const SIM_HZ = 120;
const STEP = 1 / SIM_HZ;
const MAX_FRAME = 0.1;
/** Converts authored light intensities to scene units. */
const LIGHT_SCALE = 0.15;

export class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(80, 1, 0.05, 400);
  private readonly ctx: RenderContext;
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly level: Level;
  private readonly ship: Ship;
  private accumulator = 0;
  private lastTime = 0;
  private fps = 60;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, levelData: LevelData) {
    this.ctx = createRenderer(canvas, this.scene, this.camera);
    this.input = new Input(canvas);
    this.hud = new HUD(hudRoot);
    this.level = new Level(levelData);
    this.ship = new Ship(this.level);

    this.scene.background = new Color(0x020206);
    this.scene.fog = new FogExp2(0x05040c, 0.012);
    this.scene.add(new HemisphereLight(0x3a4466, 0x0a0812, 0.35));
    this.scene.add(buildLevelMesh(this.level));
    for (const l of levelData.lights) {
      const light = new PointLight(l.color, l.intensity * LIGHT_SCALE, l.distance, 1.4);
      light.position.set(...l.position);
      this.scene.add(light);
    }

    // Ship headlight rides with the camera.
    const headlight = new PointLight(0xcfe3ff, 1.6, 22, 1.0);
    this.camera.add(headlight);
    this.scene.add(this.camera);
    this.syncCamera(1);

    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = this;
  }

  /** Dev/test hook: advance the simulation with fixed controls. */
  debugFly(seconds: number, controls: Partial<FlightControls>): void {
    const c: FlightControls = { forward: 0, strafe: 0, lift: 0, roll: 0, pitch: 0, yaw: 0, boost: false, ...controls };
    for (let t = 0; t < seconds; t += STEP) this.ship.step(STEP, c);
    this.ship.prevPosition.copy(this.ship.position);
  }

  get debugShip(): Ship {
    return this.ship;
  }

  start(): void {
    requestAnimationFrame((t) => {
      this.lastTime = t;
      requestAnimationFrame(this.frame);
    });
  }

  private readonly frame = (time: number): void => {
    const dt = Math.min((time - this.lastTime) / 1000, MAX_FRAME);
    this.lastTime = time;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const locked = this.input.locked;
    if (locked) {
      const { dx, dy } = this.input.consumeMouse();
      this.ship.applyMouse(dx, dy);
      this.accumulator += dt;
      const controls = this.input.controls();
      let impact = 0;
      while (this.accumulator >= STEP) {
        this.ship.step(STEP, controls);
        impact = Math.max(impact, this.ship.lastImpact);
        this.accumulator -= STEP;
      }
      if (impact > 8) this.hud.flashImpact(impact);
    }

    this.syncCamera(this.accumulator / STEP);
    this.ctx.composer.render();
    this.hud.update({
      speed: this.ship.velocity.length(),
      segment: this.ship.segment,
      fps: this.fps,
      locked,
      levelName: this.level.name,
    });
    requestAnimationFrame(this.frame);
  };

  private syncCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.ship.prevPosition, this.ship.position, alpha);
    this.camera.quaternion.copy(this.ship.quaternion);
  }
}
