import { Color, FogExp2, Group, HemisphereLight, PerspectiveCamera, PointLight, Scene } from 'three';
import { PlayerWeapons } from '../combat/PlayerWeapons';
import { ProjectileRenderer } from '../combat/ProjectileRenderer';
import { ProjectileSystem } from '../combat/Projectiles';
import type { Damageable } from '../combat/types';
import { Door } from '../entities/Door';
import { Pickup } from '../entities/Pickup';
import { Target } from '../entities/Target';
import { GameEffects } from '../fx/GameEffects';
import { Input, type FlightControls } from '../input/Input';
import { Level } from '../level/Level';
import { buildLevelMesh } from '../level/LevelMesh';
import type { KeyColor, LevelData } from '../level/types';
import { Ship } from '../physics/Ship';
import { keyCss } from '../render/palette';
import { PortalCuller } from '../render/PortalCuller';
import { createRenderer, type RenderContext } from '../render/Renderer';
import { HUD } from '../ui/HUD';
import { Player } from './Player';

const SIM_HZ = 120;
const STEP = 1 / SIM_HZ;
const MAX_FRAME = 0.1;
/** Converts authored light intensities to scene units. */
const LIGHT_SCALE = 0.15;
const RESPAWN_DELAY = 2.5;

const IDLE_CONTROLS: FlightControls = {
  forward: 0, strafe: 0, lift: 0, roll: 0, pitch: 0, yaw: 0,
  boost: false, firePrimary: false, fireSecondary: false,
};

export class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(80, 1, 0.05, 400);
  private readonly ctx: RenderContext;
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly level: Level;
  private readonly ship: Ship;
  private readonly player: Player;
  private readonly segmentMeshes: Group[];
  private readonly doors: Door[];
  private readonly pickups: Pickup[];
  private readonly targets: Target[];
  private readonly culler: PortalCuller;
  private readonly effects = new GameEffects();
  private readonly projectiles: ProjectileSystem;
  private readonly projectileRenderer = new ProjectileRenderer();
  private readonly weapons: PlayerWeapons;
  private readonly damageables: Damageable[] = [];
  private messageCooldown = 0;
  private respawnTimer = 0;
  private accumulator = 0;
  private lastTime = 0;
  private fps = 60;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, levelData: LevelData) {
    this.ctx = createRenderer(canvas, this.scene, this.camera);
    this.input = new Input(canvas);
    this.hud = new HUD(hudRoot);
    this.level = new Level(levelData);
    this.ship = new Ship(this.level);
    this.player = new Player(this.ship);

    this.scene.background = new Color(0x020206);
    this.scene.fog = new FogExp2(0x05040c, 0.012);
    this.scene.add(new HemisphereLight(0x3a4466, 0x0a0812, 0.35));
    const meshes = buildLevelMesh(this.level);
    this.scene.add(meshes.root);
    this.segmentMeshes = meshes.segments;
    for (const l of levelData.lights) {
      const light = new PointLight(l.color, l.intensity * LIGHT_SCALE, l.distance, 1.4);
      light.position.set(...l.position);
      this.scene.add(light);
    }

    this.doors = this.level.doors.map((d) => new Door(d));
    for (const d of this.doors) this.scene.add(d.object);
    this.pickups = [
      ...levelData.keys.map((k) => new Pickup({ kind: 'key', color: k.color }, k.position, k.segment)),
      ...levelData.pickups.map((p) => new Pickup({ kind: p.kind }, p.position, p.segment)),
    ];
    for (const p of this.pickups) this.segmentMeshes[p.segment].add(p.object);
    this.targets = levelData.targets.map((t) => new Target(t, this.effects));
    for (const t of this.targets) this.segmentMeshes[t.segment].add(t.object);
    this.culler = new PortalCuller(this.level);

    this.damageables.push(this.player, ...this.targets);
    this.projectiles = new ProjectileSystem(this.level, this.effects, () => this.damageables);
    this.weapons = new PlayerWeapons(this.player, this.level, this.projectiles, this.effects);
    this.scene.add(this.effects.object, this.projectileRenderer.object);

    // Ship headlight rides with the camera.
    const headlight = new PointLight(0xcfe3ff, 1.6, 22, 1.0);
    this.camera.add(headlight);
    this.scene.add(this.camera);
    this.syncCamera(1);

    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = this;
  }

  /** Dev/test hook: advance the simulation with fixed controls. */
  debugFly(seconds: number, controls: Partial<FlightControls>): void {
    const c = { ...IDLE_CONTROLS, ...controls };
    for (let t = 0; t < seconds; t += STEP) {
      this.simulate(STEP, c);
      this.updateFrame(STEP);
    }
    this.ship.prevPosition.copy(this.ship.position);
  }

  /** Dev/test hook: grant a key. */
  debugGiveKey(color: KeyColor): void {
    this.player.keys.add(color);
  }

  get debugPlayer(): Player {
    return this.player;
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
      if (this.player.alive) this.ship.applyMouse(dx, dy);
      this.accumulator += dt;
      const controls = this.player.alive ? this.input.controls() : IDLE_CONTROLS;
      while (this.accumulator >= STEP) {
        this.simulate(STEP, controls);
        this.accumulator -= STEP;
      }
      this.updateFrame(dt);
    }

    this.syncCamera(this.accumulator / STEP);
    this.cull();
    this.projectileRenderer.sync(this.projectiles.projectiles);
    this.ctx.composer.render();
    this.hud.update({
      speed: this.ship.velocity.length(),
      segment: this.ship.segment,
      fps: this.fps,
      locked,
      levelName: this.level.name,
      keys: [...this.player.keys],
      visibleSegments: this.culler.visible.filter(Boolean).length,
      shield: this.player.shield,
      energy: this.player.energy,
      missiles: this.player.missiles,
      dead: !this.player.alive,
    });
    requestAnimationFrame(this.frame);
  };

  /** Fixed-rate simulation: movement, weapons, projectiles. */
  private simulate(dt: number, controls: FlightControls): void {
    if (this.player.alive) {
      this.ship.step(dt, controls);
      const event = this.weapons.update(dt, controls.firePrimary, controls.fireSecondary);
      if (event === 'no-energy') this.notify('ENERGY DEPLETED', '#ffa31a');
      if (event === 'no-missiles') this.notify('NO MISSILES', '#ff2bd6');
    }
    this.projectiles.update(dt);
  }

  /** Per-frame updates: doors, pickups, targets, effects, death. */
  private updateFrame(dt: number): void {
    const pos = this.ship.position;
    const r = this.player.radius;
    this.messageCooldown -= dt;

    if (this.player.damageTaken > 0) {
      this.hud.flashImpact(10 + this.player.damageTaken);
      this.player.damageTaken = 0;
    }
    if (this.ship.lastImpact > 8) this.hud.flashImpact(this.ship.lastImpact);

    for (const door of this.doors) {
      const key = door.key;
      const event = door.update(dt, pos, r, key === null || this.player.keys.has(key));
      if (event === 'locked' && key) this.notify(`${key.toUpperCase()} KEY REQUIRED`, keyCss(key));
    }
    for (const p of this.pickups) {
      if (!this.player.alive || !p.update(dt, pos, r)) continue;
      if (p.type.kind === 'key') {
        this.player.keys.add(p.type.color);
        p.collect();
        this.hud.message(`${p.type.color.toUpperCase()} KEY ACQUIRED`, keyCss(p.type.color));
      } else if (this.player.collect(p.type.kind)) {
        p.collect();
        this.hud.message(`${p.type.kind.toUpperCase()} BOOST`);
      }
    }
    for (const t of this.targets) t.update(dt);
    this.effects.update(dt);
    this.handleDeath(dt);
  }

  private handleDeath(dt: number): void {
    if (this.player.alive) {
      this.respawnTimer = 0;
      return;
    }
    if (this.respawnTimer === 0) {
      this.effects.explosion(this.ship.position, 2, 0xff5533);
      this.hud.message('SHIP DESTROYED', '#ff2a4d');
      this.ship.velocity.set(0, 0, 0);
    }
    this.respawnTimer += dt;
    if (this.respawnTimer >= RESPAWN_DELAY) {
      this.player.respawn();
      this.respawnTimer = 0;
      this.hud.message('SHIP RECONSTRUCTED');
    }
  }

  /** Rate-limited HUD message for repeated warnings. */
  private notify(text: string, color: string): void {
    if (this.messageCooldown > 0) return;
    this.hud.message(text, color);
    this.messageCooldown = 2;
  }

  private cull(): void {
    const camSeg = this.level.findSegment(this.camera.position, this.ship.segment);
    const visible = this.culler.compute(this.camera, camSeg, (seg, side) => {
      const door = this.level.doorAt(seg, side);
      return !door || door.openAmount > 0.01;
    });
    this.segmentMeshes.forEach((g, i) => { g.visible = visible[i]; });
    for (const d of this.doors) {
      d.object.visible = (visible[d.state.segment] || visible[d.state.child]) && d.state.openAmount < 0.995;
    }
  }

  private syncCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.ship.prevPosition, this.ship.position, alpha);
    this.camera.quaternion.copy(this.ship.quaternion);
  }
}
