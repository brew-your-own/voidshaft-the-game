import { Color, FogExp2, Group, HemisphereLight, PerspectiveCamera, PointLight, Scene } from 'three';
import { Door } from '../entities/Door';
import { KeyPickup } from '../entities/KeyPickup';
import { Input, type FlightControls } from '../input/Input';
import { Level } from '../level/Level';
import { buildLevelMesh } from '../level/LevelMesh';
import type { KeyColor, LevelData } from '../level/types';
import { Ship, SHIP_TUNING } from '../physics/Ship';
import { keyCss } from '../render/palette';
import { PortalCuller } from '../render/PortalCuller';
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
  private readonly segmentMeshes: Group[];
  private readonly doors: Door[];
  private readonly keys: KeyPickup[];
  private readonly inventory = new Set<KeyColor>();
  private readonly culler: PortalCuller;
  private lockedMessageCooldown = 0;
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
    const meshes = buildLevelMesh(this.level);
    this.scene.add(meshes.root);
    this.segmentMeshes = meshes.segments;
    this.doors = this.level.doors.map((d) => new Door(d));
    for (const d of this.doors) this.scene.add(d.object);
    this.keys = levelData.keys.map((k) => new KeyPickup(k));
    for (const k of this.keys) this.segmentMeshes[k.segment].add(k.object);
    this.culler = new PortalCuller(this.level);
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
    for (let t = 0; t < seconds; t += STEP) {
      this.ship.step(STEP, c);
      this.updateEntities(STEP);
    }
    this.ship.prevPosition.copy(this.ship.position);
  }

  /** Dev/test hook: grant a key. */
  debugGiveKey(color: KeyColor): void {
    this.inventory.add(color);
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
      this.updateEntities(dt);
    }

    this.syncCamera(this.accumulator / STEP);
    this.cull();
    this.ctx.composer.render();
    this.hud.update({
      speed: this.ship.velocity.length(),
      segment: this.ship.segment,
      fps: this.fps,
      locked,
      levelName: this.level.name,
      keys: [...this.inventory],
      visibleSegments: this.culler.visible.filter(Boolean).length,
    });
    requestAnimationFrame(this.frame);
  };

  private updateEntities(dt: number): void {
    const pos = this.ship.position;
    const r = SHIP_TUNING.radius;
    this.lockedMessageCooldown -= dt;
    for (const door of this.doors) {
      const key = door.key;
      const event = door.update(dt, pos, r, key === null || this.inventory.has(key));
      if (event === 'locked' && key && this.lockedMessageCooldown <= 0) {
        this.hud.message(`${key.toUpperCase()} KEY REQUIRED`, keyCss(key));
        this.lockedMessageCooldown = 2;
      }
    }
    for (const k of this.keys) {
      if (k.update(dt, pos, r)) {
        this.inventory.add(k.color);
        this.hud.message(`${k.color.toUpperCase()} KEY ACQUIRED`, keyCss(k.color));
      }
    }
  }

  private cull(): void {
    const camSeg = this.level.findSegment(this.camera.position, this.ship.segment);
    const visible = this.culler.compute(this.camera, camSeg, (seg, side) => {
      const door = this.level.doorAt(seg, side);
      return !door || door.openAmount > 0.01;
    });
    this.segmentMeshes.forEach((g, i) => { g.visible = visible[i]; });
    for (const d of this.doors) d.object.visible = (visible[d.state.segment] || visible[d.state.child]) && d.state.openAmount < 0.995;
  }

  private syncCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.ship.prevPosition, this.ship.position, alpha);
    this.camera.quaternion.copy(this.ship.quaternion);
  }
}
