import { Color, FogExp2, Group, HemisphereLight, PerspectiveCamera, PointLight, Quaternion, Scene, Vector3 } from 'three';
import { AudioEngine } from '../audio/Audio';
import { PlayerWeapons } from '../combat/PlayerWeapons';
import { ProjectileRenderer } from '../combat/ProjectileRenderer';
import { ProjectileSystem } from '../combat/Projectiles';
import type { Damageable } from '../combat/types';
import { Door } from '../entities/Door';
import { Pickup } from '../entities/Pickup';
import { Reactor, REACTOR_TUNING, type ReactorEvent } from '../entities/Reactor';
import { Robot, type RobotWorld } from '../entities/robots/Robot';
import { setRobotEnvironment } from '../entities/robots/RobotMeshes';
import { Target } from '../entities/Target';
import { CameraShake, SHAKE_TUNING, damageTrauma, explosionTrauma } from '../fx/CameraShake';
import { EscapeSequence, screenGuide } from '../fx/EscapeSequence';
import { GameEffects } from '../fx/GameEffects';
import { StaticLights } from '../fx/StaticLights';
import { hitFlashStrength } from '../render/HitFlashPass';
import { distanceToTris } from '../physics/Collision';
import { Input, type FlightControls } from '../input/Input';
import { MapMemory } from '../level/automap';
import { LEVEL_STORAGE_KEY, type LevelSummary } from '../level/levelIndex';
import { loadLevel } from '../level/LevelLoader';
import { Level, type DoorState } from '../level/Level';
import { buildLevelMesh } from '../level/LevelMesh';
import type { KeyColor, LevelData, PickupKind } from '../level/types';
import { Ship } from '../physics/Ship';
import { AUTOMAP_TUNING, AutomapView, type AutomapState } from '../render/AutomapView';
import { KEY_PALETTE, PALETTE, keyCss } from '../render/palette';
import { PortalCuller } from '../render/PortalCuller';
import { createNeonEnvironment } from '../render/NeonEnvironment';
import { createRenderer, type RenderContext } from '../render/Renderer';
import { ResolutionGovernor } from '../render/Resolution';
import { HUD } from '../ui/HUD';
import { EnemyViewer } from '../ui/EnemyViewer';
import { MapViewer } from '../ui/MapViewer';
import { Menu } from '../ui/Menu';
import { Objective } from './Objective';
import { Player } from './Player';
import { Settings } from './Settings';

const SIM_HZ = 120;
const STEP = 1 / SIM_HZ;
const MAX_FRAME = 0.1;
/** Converts authored light intensities to scene units. */
const LIGHT_SCALE = 0.15;
const RESPAWN_DELAY = 2.5;
/** Delay before the end screen, so the final explosion can play. */
const END_DELAY = 2.2;
/** How much of the escape rumble (0..1) becomes sustained camera shake. */
const ESCAPE_RUMBLE_SHAKE = 0.65;

const _shakeOffset = new Vector3();
const _shakeTurn = new Quaternion();

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
  private readonly robots: Robot[] = [];
  private readonly reactor: Reactor | null = null;
  private readonly objective: Objective;
  private readonly alarmLight = new HemisphereLight(0xff1030, 0x200008, 0);
  private endTimer = -1;
  /** View-only shake; see fx/CameraShake. */
  private readonly cameraShake = new CameraShake();
  private readonly culler: PortalCuller;
  private readonly settings = new Settings();
  private readonly audio = new AudioEngine();
  private readonly effects = new GameEffects(this.audio);
  private readonly menu: Menu;
  private started = false;
  /** Escape set piece: red strobe, klaxon, sparks, exit guide, rumble. */
  private readonly escape: EscapeSequence;
  private readonly fogBase = new Color();
  private readonly backgroundBase = new Color();
  private warningTimer = 0;
  private readonly projectiles: ProjectileSystem;
  private readonly projectileRenderer = new ProjectileRenderer();
  private readonly weapons: PlayerWeapons;
  private readonly damageables: Damageable[] = [];
  private messageCooldown = 0;
  private respawnTimer = 0;
  private accumulator = 0;
  private lastTime = 0;
  private fps = 60;
  /** Smoothed CPU time spent in a frame, in ms. */
  private cpuMs = 0;
  private readonly governor = new ResolutionGovernor();
  private readonly mapMemory: MapMemory;
  private readonly automap: AutomapView;
  private mapOpen = false;
  private readonly viewer: MapViewer;
  private readonly enemies: EnemyViewer;
  private readonly staticLights: StaticLights;

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    levelData: LevelData,
    levels: { list: LevelSummary[]; current: string } = { list: [], current: 'level01' },
  ) {
    this.ctx = createRenderer(canvas, this.scene, this.camera);
    // Robot hulls reflect a neon room; level walls are unaffected.
    setRobotEnvironment(createNeonEnvironment(this.ctx.renderer));
    this.input = new Input(canvas, () => this.settings.data.bindings);
    this.hud = new HUD(hudRoot);
    this.menu = new Menu(hudRoot, this.settings, {
      onPlay: () => {
        this.audio.unlock();
        this.input.requestLock();
      },
      onRestart: () => window.location.reload(),
      onClick: () => {
        this.audio.unlock();
        this.audio.play('uiClick');
      },
      onSelectLevel: (id) => {
        try { localStorage.setItem(LEVEL_STORAGE_KEY, id); } catch { /* storage blocked */ }
        const url = new URL(window.location.href);
        url.searchParams.set('level', id);
        window.location.assign(url);
      },
      onViewMap: (id) => this.openViewer(id, levels.current === id ? levelData : null),
      onViewEnemies: () => {
        this.menu.hide();
        this.hud.root.classList.add('viewer');
        this.enemies.open();
      },
    }, levels);
    this.viewer = new MapViewer(hudRoot, canvas, () => {
      hudRoot.classList.remove('viewer');
      this.menu.show('main');
    });
    this.enemies = new EnemyViewer(hudRoot, canvas, () => {
      hudRoot.classList.remove('viewer');
      this.menu.show('main');
    });
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    this.level = new Level(levelData);
    this.ship = new Ship(this.level);
    this.player = new Player(this.ship);

    const theme = levelData.theme;
    this.scene.background = new Color(0x020206).lerp(new Color(theme?.fog ?? 0x020206), 0.5);
    this.scene.fog = new FogExp2(theme?.fog ?? 0x05040c, 0.012);
    this.scene.add(new HemisphereLight(theme?.ambient ?? 0x3a4466, 0x0a0812, 0.35));
    const meshes = buildLevelMesh(this.level);
    this.scene.add(meshes.root);
    this.segmentMeshes = meshes.segments;
    this.staticLights = new StaticLights(levelData.lights, LIGHT_SCALE);
    this.scene.add(this.staticLights.object);

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
    this.mapMemory = new MapMemory(this.level.segments.length);
    this.automap = new AutomapView(this.level);

    this.projectiles = new ProjectileSystem(this.level, this.effects, () => this.damageables);
    const world: RobotWorld = {
      level: this.level,
      projectiles: this.projectiles,
      effects: this.effects,
      player: this.player,
      robots: this.robots,
      rng: Math.random,
      onDeath: (r) => this.onRobotDeath(r),
    };
    for (const r of levelData.robots ?? []) this.robots.push(new Robot(r.type, r, world));
    for (const r of this.robots) this.scene.add(r.object);
    this.damageables.push(this.player, ...this.targets, ...this.robots);
    if (levelData.reactor) {
      this.reactor = new Reactor(levelData.reactor, this.level, this.projectiles, this.effects, this.player);
      this.segmentMeshes[this.reactor.segment].add(this.reactor.object);
      for (const p of this.reactor.pylons) this.segmentMeshes[p.segment].add(p.object);
      this.damageables.push(...this.reactor.damageables);
    }
    this.objective = new Objective(levelData.reactor?.countdown ?? 0);
    this.escape = new EscapeSequence(this.level, this.effects, (p) => this.effects.particles.emit(p), this.audio);
    this.fogBase.copy((this.scene.fog as FogExp2).color);
    this.backgroundBase.copy(this.scene.background as Color);
    this.scene.add(this.alarmLight);
    this.weapons = new PlayerWeapons(this.player, this.level, this.projectiles, this.effects);
    this.scene.add(this.effects.object, this.projectileRenderer.object);
    this.effects.setLevel(this.level);
    this.effects.shockwaves.viewer = this.camera.position;
    this.effects.onExplosion = (p, size) => this.cameraShake.add(explosionTrauma(size, p.distanceTo(this.ship.position)));

    // Ship headlight rides with the camera.
    const headlight = new PointLight(0xcfe3ff, 1.6, 22, 1.0);
    this.camera.add(headlight);
    this.scene.add(this.camera);
    this.syncCamera(1);
    // Two long steps: pick the lights near the start, then fade them fully in.
    this.staticLights.update(1, this.camera.position);
    this.staticLights.update(1, this.camera.position);
    this.applySettings();
    this.settings.onChange(() => this.applySettings());
    this.warmUp();

    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = this;
  }

  /** Shows a level's map from the title screen; loads it first if it isn't this one. */
  private openViewer(id: string, data: LevelData | null): void {
    const show = (d: LevelData) => {
      this.menu.hide();
      this.hud.root.classList.add('viewer');
      this.viewer.open(d);
    };
    if (data) { show(data); return; }
    loadLevel(id).then(show).catch((err: unknown) => this.hud.message(`CANNOT LOAD ${id}: ${String(err)}`, '#ff2a4d'));
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

  get debugRobots(): Robot[] {
    return this.robots;
  }

  get debugReactor(): Reactor | null {
    return this.reactor;
  }

  get debugObjective(): Objective {
    return this.objective;
  }

  get debugEscapeSequence(): EscapeSequence {
    return this.escape;
  }

  /**
   * Dev hook: blows up the reactor (emitters first) and plays out its death,
   * which starts the escape. Without a reactor, starts the escape directly.
   */
  debugEscape(): void {
    const r = this.reactor;
    if (!r) { this.objective.reactorDestroyed(); return; }
    for (const p of r.pylons) p.damage(1e6, p.position);
    r.damage(1e6, r.position);
    this.debugFly(REACTOR_TUNING.deathTime + 0.1, {});
  }

  /**
   * Compiles every shader up front. Otherwise each robot type, the reactor
   * and so on compile the first time they come into view, stalling a frame.
   */
  private warmUp(): void {
    for (const g of this.segmentMeshes) g.visible = true;
    for (const r of this.robots) r.object.visible = true;
    for (const d of this.doors) d.object.visible = true;
    // A real render, not renderer.compile(): the composer draws into an
    // offscreen target, which needs different shader variants than the screen.
    this.ctx.composer.render();
    this.automap.update(0, this.mapState(), (d) => this.doorColor(d));
    this.automap.render(this.ctx, this.camera.aspect);
    this.cull();
  }

  private applySettings(): void {
    const s = this.settings.data;
    if (!s.adaptiveResolution) this.governor.reset();
    this.ctx.setScale(s.renderScale * this.governor.scale);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.ship.invertY = s.invertY;
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
    this.hud.showTelemetry = s.showTelemetry;
    this.cameraShake.enabled = s.screenShake;
  }

  /** Mouse captured → fly; released mid-mission → pause menu. */
  private onLockChange(): void {
    this.mapOpen = false;
    if (this.input.locked) {
      this.started = true;
      this.menu.hide();
      this.accumulator = 0;
      return;
    }
    if (this.objective.over) return;
    this.menu.show(this.started ? 'pause' : 'main');
  }

  start(): void {
    requestAnimationFrame((t) => {
      this.lastTime = t;
      requestAnimationFrame(this.frame);
    });
  }

  private readonly frame = (time: number): void => {
    const cpuStart = performance.now();
    const dt = Math.min((time - this.lastTime) / 1000, MAX_FRAME);
    this.lastTime = time;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.ctx.hitFlash.update(dt);

    if (this.viewer.active) {
      this.ctx.renderer.info.reset();
      this.viewer.render(this.ctx, this.camera.aspect, dt);
      requestAnimationFrame(this.frame);
      return;
    }
    if (this.enemies.active) {
      this.ctx.renderer.info.reset();
      this.enemies.render(this.ctx, this.camera.aspect, dt);
      requestAnimationFrame(this.frame);
      return;
    }

    const locked = this.input.locked;
    if (locked && this.input.consumePress('automap') && !this.objective.over) this.toggleMap();
    this.input.flushPresses();
    if (this.mapOpen) {
      this.steerMap(dt);
    } else if (locked && this.endTimer < END_DELAY) {
      const { dx, dy } = this.input.consumeMouse();
      this.input.consumeWheel();
      const k = this.settings.data.mouseSensitivity;
      if (this.player.alive) this.ship.applyMouse(dx * k, dy * k);
      this.accumulator += dt;
      const controls = this.player.alive ? this.input.controls() : IDLE_CONTROLS;
      while (this.accumulator >= STEP) {
        this.simulate(STEP, controls);
        this.accumulator -= STEP;
      }
      this.updateFrame(dt);
    }

    this.updateAudio(locked && !this.mapOpen);
    const info = this.ctx.renderer.info;
    info.reset();
    if (this.mapOpen) {
      this.automap.update(dt, this.mapState(), (d) => this.doorColor(d));
      this.automap.render(this.ctx, this.camera.aspect);
    } else {
      this.syncCamera(this.accumulator / STEP);
      this.staticLights.update(dt, this.camera.position);
      for (const r of this.robots) if (r.alive) r.syncObject(this.accumulator / STEP);
      this.cull();
      this.projectileRenderer.sync(this.projectiles.projectiles);
      this.ctx.composer.render();
      if (locked && this.governor.update(dt, this.settings.data.adaptiveResolution)) this.applySettings();
    }
    this.hud.update({
      speed: this.ship.velocity.length(),
      segment: this.ship.segment,
      fps: this.fps,
      cpuMs: this.cpuMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      resolution: this.ctx.scale,
      locked,
      automap: this.mapOpen,
      levelName: this.level.name,
      keys: [...this.player.keys],
      visibleSegments: this.culler.visible.filter(Boolean).length,
      shield: this.player.shield,
      energy: this.player.energy,
      missiles: this.player.missiles,
      dead: !this.player.alive,
      hostiles: this.robots.reduce((n, r) => n + (r.alive ? 1 : 0), 0),
      ships: this.objective.ships,
      countdown: this.objective.state === 'escape' ? this.objective.timeLeft : null,
      escape: this.escape.active ? {
        urgency: this.escape.urgency,
        alarm: this.escape.pulse,
        guide: this.escape.guideTarget ? screenGuide(this.escape.guideTarget, this.camera) : null,
        hops: this.escape.guideHops,
      } : null,
    });
    this.cpuMs += (performance.now() - cpuStart - this.cpuMs) * 0.05;
    requestAnimationFrame(this.frame);
  };

  /** Opens or closes the automap. The game is paused while it is open. */
  private toggleMap(): void {
    this.mapOpen = !this.mapOpen;
    this.input.consumeMouse();
    this.input.consumeWheel();
    this.audio.play('uiClick');
    if (this.mapOpen) this.automap.open(this.mapState());
  }

  /** Mouse turns the map, the wheel or forward/back keys zoom. */
  private steerMap(dt: number): void {
    const t = AUTOMAP_TUNING;
    const { dx, dy } = this.input.consumeMouse();
    this.automap.rotate(dx, dy);
    const keys = (this.input.held('back') ? 1 : 0) - (this.input.held('forward') ? 1 : 0);
    this.automap.zoom(Math.exp(this.input.consumeWheel() * t.wheelZoom + keys * t.keyZoom * dt));
  }

  private mapState(): AutomapState {
    const r = this.reactor;
    return {
      seen: this.mapMemory.seen,
      shipPosition: this.ship.position,
      shipQuaternion: this.ship.quaternion,
      reactor: r ? { position: r.position, segment: r.segment, alive: !r.destroyed } : null,
      keys: this.pickups.flatMap((p) => (p.type.kind === 'key'
        ? [{ color: p.type.color, position: p.position, segment: p.segment, collected: p.collected }]
        : [])),
    };
  }

  /** Automap door colours: key colour, red sealed exit, green open exit. */
  private doorColor(d: DoorState): Color {
    if (d.exit) return new Color(this.objective.state === 'escape' ? PALETTE.lime : PALETTE.red).multiplyScalar(2);
    if (d.key) return new Color(KEY_PALETTE[d.key]).multiplyScalar(2);
    return new Color(PALETTE.white).multiplyScalar(0.9);
  }

  private updateAudio(active: boolean): void {
    const a = this.audio;
    a.setListener(this.camera.position, this.camera.quaternion);
    const flying = active && this.player.alive && !this.objective.over;
    a.setEngine(flying ? this.ship.velocity.length() + 1 : 0, flying && this.input.controls().boost);
    const o = this.objective;
    a.setAlarm(active && o.state === 'escape', 1 - o.timeLeft / Math.max(1, o.countdown));
  }

  /** Fixed-rate simulation: movement, weapons, projectiles. */
  private simulate(dt: number, controls: FlightControls): void {
    if (this.player.alive && !this.objective.over) {
      this.ship.step(dt, controls);
      const event = this.weapons.update(dt, controls.firePrimary, controls.fireSecondary);
      if (event === 'no-energy') this.notify('ENERGY DEPLETED', '#ffa31a');
      if (event === 'no-missiles') this.notify('NO MISSILES', '#ff2bd6');
    }
    // Once out of the mine, the fight is over.
    if (this.objective.state === 'won') return;
    for (const r of this.robots) r.update(dt);
    this.reactor?.update(dt);
    this.projectiles.update(dt);
  }

  /** Per-frame updates: doors, pickups, targets, effects, death. */
  private updateFrame(dt: number): void {
    const pos = this.ship.position;
    const r = this.player.radius;
    this.messageCooldown -= dt;

    if (this.player.damageTaken > 0) {
      this.hud.flashImpact(10 + this.player.damageTaken);
      this.audio.play('hit', undefined, hitFlashStrength(this.player.damageTaken));
      this.cameraShake.add(damageTrauma(this.player.damageTaken));
      this.ctx.hitFlash.flash(hitFlashStrength(this.player.damageTaken));
      this.player.damageTaken = 0;
    }
    if (this.weapons.missilesLaunched > 0) {
      this.cameraShake.add(SHAKE_TUNING.missileLaunch);
      this.weapons.missilesLaunched = 0;
    }
    if (this.ship.lastImpact > 8) {
      this.hud.flashImpact(this.ship.lastImpact);
      this.audio.play('scrape', undefined, this.ship.lastImpact);
    }
    if (this.projectiles.playerHits > 0) {
      this.hud.hitMarker();
      this.audio.play('hitMarker');
      this.projectiles.playerHits = 0;
    }
    this.updateMissileWarning(dt);

    for (const door of this.doors) {
      const key = door.key;
      const blocked = this.robots.some((b) => b.alive && distanceToTris(b.position, door.state.tris) < b.radius + 0.35);
      const unlocked = door.state.exit
        ? this.objective.state === 'escape'
        : key === null || this.player.keys.has(key);
      const event = door.update(dt, pos, r, unlocked, blocked);
      if (event === 'locked') this.audio.play('locked', door.state.center);
      if (event === 'opened') this.audio.play('doorOpen', door.state.center);
      if (event === 'locked' && door.state.exit) this.notify('EXIT SEALED — DESTROY THE REACTOR', '#ff2a4d');
      else if (event === 'locked' && key) this.notify(`${key.toUpperCase()} KEY REQUIRED`, keyCss(key));
      if (event === 'opened' && door.state.exit) this.hud.message('EXIT OPEN — GO!', '#00e5ff');
      if (door.state.exit && this.ship.segment === door.state.child && this.player.alive) this.objective.reachedExit();
    }
    for (const p of this.pickups) {
      if (!this.player.alive || !p.update(dt, pos, r)) continue;
      if (p.type.kind === 'key') {
        this.player.keys.add(p.type.color);
        p.collect();
        this.audio.play('key');
        this.hud.message(`${p.type.color.toUpperCase()} KEY ACQUIRED`, keyCss(p.type.color));
      } else if (this.player.collect(p.type.kind)) {
        p.collect();
        this.audio.play('pickup');
        this.hud.message(`${p.type.kind.toUpperCase()} BOOST`);
      }
    }
    for (const t of this.targets) t.update(dt);
    if (this.reactor) {
      for (const e of this.reactor.events.splice(0)) this.onReactorEvent(e);
    }
    this.effects.update(dt);
    this.cameraShake.update(dt);
    this.updateMission(dt);
    this.handleDeath(dt);
  }

  private onReactorEvent(e: ReactorEvent): void {
    switch (e) {
      case 'shield-hit': this.notify('REACTOR SHIELDED — DESTROY THE EMITTERS', '#00e5ff'); break;
      case 'pylon-destroyed': {
        const left = this.reactor!.pylons.filter((p) => p.alive).length;
        if (left > 0) this.hud.message(`EMITTER DOWN — ${left} LEFT`, '#00e5ff');
        break;
      }
      case 'shield-down': this.hud.message('REACTOR SHIELD DOWN', '#ffa31a'); break;
      case 'core-critical': this.hud.message('REACTOR CRITICAL', '#ff2a4d'); this.cameraShake.add(0.5); break;
      case 'destroyed':
        this.objective.reactorDestroyed();
        this.objective.kills++;
        this.cameraShake.add(0.8);
        this.hud.message('REACTOR DESTROYED — ESCAPE!', '#ff2a4d');
        break;
    }
  }

  /** Countdown, alarm, loss by collapse and the end screen. */
  private updateMission(dt: number): void {
    const o = this.objective;
    const wasEscaping = o.state === 'escape';
    o.update(dt);
    if (wasEscaping && o.state === 'lost' && this.player.alive) {
      // The mine collapses around the ship.
      this.player.shield = 0;
      this.player.alive = false;
      this.effects.explosion(this.ship.position, 3, 0xffa31a);
      this.cameraShake.add(1);
    }
    // Escape set piece: strobing red lights and fog, klaxon and countdown, sparks, rumble.
    const esc = this.escape;
    esc.update(dt, o.state, o.timeLeft, o.countdown, this.ship.position, this.ship.segment);
    this.staticLights.setAlarm(esc.alarmColor, esc.tint, esc.lightScale[0], esc.lightScale[1]);
    this.alarmLight.intensity = esc.ambient;
    (this.scene.fog as FogExp2).color.copy(this.fogBase).lerp(esc.fogColor, esc.fogTint);
    (this.scene.background as Color).copy(this.backgroundBase).lerp(esc.fogColor, esc.fogTint);
    this.cameraShake.setSustained(esc.active ? ESCAPE_RUMBLE_SHAKE * esc.rumble : 0);

    if (!o.over) return;
    if (this.endTimer < 0) this.endTimer = 0;
    const before = this.endTimer;
    this.endTimer += dt;
    if (before === 0) this.audio.play(o.state === 'won' ? 'win' : 'lose');
    if (before < END_DELAY && this.endTimer >= END_DELAY) this.showEndScreen();
  }

  private showEndScreen(): void {
    const o = this.objective;
    const time = `${Math.floor(o.elapsed / 60)}:${String(Math.floor(o.elapsed % 60)).padStart(2, '0')}`;
    const subtitles = {
      'out-of-ships': 'All ships lost.',
      collapse: 'The mine collapsed before you got out.',
      caught: 'Your ship was destroyed during the escape.',
    };
    this.hud.showEnd({
      won: o.state === 'won',
      title: o.state === 'won' ? 'MINE CLEARED' : 'MISSION FAILED',
      subtitle: o.state === 'won'
        ? `Escaped with ${o.timeLeft.toFixed(1)} s to spare.`
        : subtitles[o.lossReason ?? 'out-of-ships'],
      stats: [
        ['TIME', time],
        ['KILLS', String(o.kills)],
        ['SHIPS LOST', String(o.deaths)],
      ],
    }, () => window.location.reload());
    this.menu.hide();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private handleDeath(dt: number): void {
    if (this.player.alive) {
      this.respawnTimer = 0;
      return;
    }
    if (this.respawnTimer === 0) {
      const collapsed = this.objective.over;
      if (!collapsed) this.effects.explosion(this.ship.position, 2, 0xff5533);
      this.hud.message('SHIP DESTROYED', '#ff2a4d');
      this.ship.velocity.set(0, 0, 0);
      if (!collapsed) this.objective.playerDied();
    }
    this.respawnTimer += dt;
    if (this.objective.over) return;
    if (this.respawnTimer >= RESPAWN_DELAY) {
      this.player.respawn();
      this.respawnTimer = 0;
      this.hud.message('SHIP RECONSTRUCTED');
    }
  }

  /** Warns when an enemy missile is homing in on the ship. */
  private updateMissileWarning(dt: number): void {
    const incoming = this.projectiles.projectiles.some(
      (p) => p.kind === 'missile' && p.faction === 'enemy' && p.target === this.player,
    );
    this.hud.missileWarning(incoming);
    this.warningTimer -= dt;
    if (incoming && this.warningTimer <= 0) {
      this.audio.play('warning');
      this.warningTimer = 0.45;
    }
  }

  /** Removes a destroyed robot and maybe leaves a powerup behind. */
  private onRobotDeath(robot: Robot): void {
    robot.object.removeFromParent();
    this.objective.kills++;
    const drop = robot.tuning.drop;
    if (drop && Math.random() < drop.chance) this.spawnPickup(drop.kind, robot.position, robot.segment);
  }

  private spawnPickup(kind: PickupKind, at: { x: number; y: number; z: number }, segment: number): void {
    const p = new Pickup({ kind }, [at.x, at.y, at.z], segment);
    this.pickups.push(p);
    this.segmentMeshes[segment].add(p.object);
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
    if (this.mapMemory.markVisible(visible)) this.automap.invalidate();
    for (const r of this.robots) r.object.visible = r.alive && visible[r.segment];
    for (const d of this.doors) {
      d.object.visible = (visible[d.state.segment] || visible[d.state.child]) && d.state.openAmount < 0.995;
    }
  }

  private syncCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.ship.prevPosition, this.ship.position, alpha);
    this.camera.quaternion.copy(this.ship.quaternion);
    // View-only shake: offset in camera space plus a small rotation.
    const s = this.cameraShake;
    this.camera.position.add(_shakeOffset.copy(s.offset).applyQuaternion(this.ship.quaternion));
    this.camera.quaternion.multiply(_shakeTurn.setFromEuler(s.rotation));
  }
}
