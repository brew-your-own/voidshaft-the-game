import {
  BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, Fog, Group, IcosahedronGeometry, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, Quaternion, Scene, Vector3,
} from 'three';
import { buildDoorLines, buildWallLines, seenBounds, type MapLines } from '../level/automap';
import type { DoorState, Level } from '../level/Level';
import type { KeyColor } from '../level/types';
import { KEY_PALETTE, PALETTE } from './palette';
import type { RenderContext } from './Renderer';

export const AUTOMAP_TUNING = {
  /** Radians per pixel of mouse movement. */
  rotateSpeed: 0.004,
  minDistance: 6,
  maxDistance: 160,
  /** Zoom per wheel pixel (exponential). */
  wheelZoom: 0.0015,
  /** Zoom per second while a forward/back key is held. */
  keyZoom: 1.6,
};

/** What the map shows besides walls and doors. */
export interface AutomapState {
  seen: readonly boolean[];
  shipPosition: Vector3;
  shipQuaternion: Quaternion;
  reactor: { position: Vector3; segment: number; alive: boolean } | null;
  keys: { color: KeyColor; position: Vector3; segment: number; collected: boolean }[];
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _v = new Vector3();

/**
 * Wireframe map of the seen part of the level, drawn in its own scene
 * through the main composer (so the lines bloom like the LEDs). The camera
 * orbits the ship's position; the mouse turns it, the wheel zooms.
 */
export class AutomapView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  private readonly walls = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  private readonly doors = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  private readonly ship = new Group();
  private readonly reactor: Mesh;
  private readonly keyMarkers = new Map<KeyColor, Mesh>();
  private readonly orbit = new Quaternion();
  private readonly target = new Vector3();
  private distance = 30;
  private time = 0;
  private dirty = true;

  constructor(private readonly level: Level) {
    this.scene.background = new Color(0x020206);
    this.scene.fog = new Fog(0x020206, 10, 100);
    // The ship: an arrow along its forward axis (-Z), with a bright tip.
    const body = new Mesh(new ConeGeometry(0.5, 1.8, 4), new MeshBasicMaterial({ color: new Color(PALETTE.lime).multiplyScalar(1.4), wireframe: true, toneMapped: false, fog: false }));
    body.rotation.x = -Math.PI / 2;
    this.ship.add(body);
    this.reactor = new Mesh(
      new IcosahedronGeometry(2, 0),
      new MeshBasicMaterial({ color: new Color(PALETTE.red).multiplyScalar(2), wireframe: true, toneMapped: false }),
    );
    for (const color of Object.keys(KEY_PALETTE) as KeyColor[]) {
      const m = new Mesh(
        new OctahedronGeometry(0.8),
        new MeshBasicMaterial({ color: new Color(KEY_PALETTE[color]).multiplyScalar(1.8), wireframe: true, toneMapped: false }),
      );
      this.keyMarkers.set(color, m);
    }
    this.scene.add(this.walls, this.doors, this.ship, this.reactor, ...this.keyMarkers.values());
  }

  /** The seen set or a door changed: rebuild the line geometry on the next draw. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Centres the map on the ship, looking the way it faces. */
  open(state: AutomapState): void {
    this.target.copy(state.shipPosition);
    this.orbit.copy(state.shipQuaternion);
    // Start a little above and behind, tilted down towards the ship.
    _q.setFromAxisAngle(X, -0.45);
    this.orbit.multiply(_q);
    const { radius } = seenBounds(this.level, state.seen);
    this.distance = clamp(radius * 0.9, 18, 90);
    this.dirty = true;
  }

  /** Turns the view around the ship (mouse), in camera-relative axes. */
  rotate(dx: number, dy: number): void {
    const k = AUTOMAP_TUNING.rotateSpeed;
    this.orbit.multiply(_q.setFromAxisAngle(Y, -dx * k));
    this.orbit.multiply(_q.setFromAxisAngle(X, -dy * k));
    this.orbit.normalize();
  }

  /** Multiplies the viewing distance (>1 zooms out). */
  zoom(factor: number): void {
    const t = AUTOMAP_TUNING;
    this.distance = clamp(this.distance * factor, t.minDistance, t.maxDistance);
  }

  update(dt: number, state: AutomapState, doorColor: (d: DoorState) => Color): void {
    this.time += dt;
    if (this.dirty) {
      setLines(this.walls, buildWallLines(this.level, state.seen));
      setLines(this.doors, buildDoorLines(this.level, state.seen, doorColor));
      this.dirty = false;
    }
    this.ship.position.copy(state.shipPosition);
    this.ship.quaternion.copy(state.shipQuaternion);
    const pulse = 0.9 + 0.1 * Math.sin(this.time * 5);
    this.ship.scale.setScalar(pulse);

    const r = state.reactor;
    this.reactor.visible = !!r && r.alive && state.seen[r.segment];
    if (r) {
      this.reactor.position.copy(r.position);
      this.reactor.rotation.set(this.time * 0.4, this.time * 0.7, 0);
    }
    for (const marker of this.keyMarkers.values()) marker.visible = false;
    for (const k of state.keys) {
      const m = this.keyMarkers.get(k.color)!;
      m.visible = !k.collected && state.seen[k.segment];
      m.position.copy(k.position);
      m.rotation.y = this.time * 1.5;
    }

    this.camera.quaternion.copy(this.orbit);
    this.camera.position.copy(this.target).add(_v.set(0, 0, this.distance).applyQuaternion(this.orbit));
    const fog = this.scene.fog as Fog;
    fog.near = this.distance * 0.6;
    fog.far = this.distance * 3 + 40;
  }

  /** Draws the map through the game's composer, then restores the game scene. */
  render(ctx: RenderContext, aspect: number): void {
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const pass = ctx.renderPass;
    const scene = pass.scene, camera = pass.camera;
    pass.scene = this.scene;
    pass.camera = this.camera;
    ctx.composer.render();
    pass.scene = scene;
    pass.camera = camera;
  }
}

function setLines(lines: LineSegments, data: MapLines): void {
  const g = lines.geometry;
  g.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(data.colors, 3));
  g.computeBoundingSphere();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
