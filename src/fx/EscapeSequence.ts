import { Color, Vector3, type Camera } from 'three';
import { KLAXON_INTERVAL, NO_SOUND, type SoundSink } from '../audio/Audio';
import { NO_EFFECTS, type Effects } from '../combat/types';
import type { MissionState } from '../game/Objective';
import type { DoorState, Level } from '../level/Level';
import { PALETTE } from '../render/palette';
import type { ParticleSpec } from './Particles';

export const ESCAPE_TUNING = {
  /** Seconds for the lights to turn fully red once the escape starts. */
  tintRampTime: 1.2,
  /** How far the level lights shift toward `alarmColor` (0..1). */
  tintAmount: 0.85,
  alarmColor: 0xff1a24,
  /** Strobe frequency in Hz, from the start of the escape to the last second. */
  strobeHz: [0.7, 4.5] as const,
  /** Exponent on urgency for the strobe rate: >1 keeps it calm early on. */
  strobeCurve: 1.6,
  /** Pulse sharpness (exponent on a raised cosine): 1 = soft, higher = flashier. */
  strobeSharpness: [1, 6] as const,
  /** Light intensity multiplier at the bottom / top of a pulse, calm → panic. */
  strobeFloor: [0.45, 0.08] as const,
  strobePeak: [1.15, 2.1] as const,
  /** Red hemisphere light intensity (bottom of pulse, top of pulse added on). */
  ambient: { base: 0.12, pulse: [0.2, 0.55] as const },
  /** Dark red that fog and background shift toward. */
  fogColor: 0x3a0408,
  /** How far fog and background shift toward `fogColor` (0..1), calm → panic. */
  fogTint: [0.5, 0.95] as const,
  /** Final stretch: the last N seconds count as full panic whatever the countdown. */
  finalSeconds: 10,
  /** Klaxon blast period in seconds, calm → panic. */
  klaxonInterval: KLAXON_INTERVAL,
  /** Seconds between spark/debris showers, calm → panic. */
  sparkInterval: [1.6, 0.22] as const,
  /** Showers spawn on walls within this distance of the player. */
  sparkRange: 9,
  /** Wall samples tried per shower; the closest in range wins. */
  sparkTries: 6,
  sparkColor: PALETTE.amber,
  debrisColor: 0x6a5a50,
  /** Falling debris particles per shower, calm → panic. */
  debrisCount: [3, 9] as const,
  /** World-space fall direction of debris (the mine is "up" along +Y). */
  gravity: [0, -1, 0] as const,
  debrisSpeed: [3, 8] as const,
  /** Rumble 0..1, calm → panic, plus a decaying kick per shower. */
  rumble: [0.15, 0.85] as const,
  rumbleCurve: 1.4,
  rumbleKick: 0.25,
  rumbleKickDecay: 2.5,
  /** Portals the exit guide may look ahead along the path (needs line of sight). */
  guideLookahead: 3,
  /** Guide target refresh period, seconds. */
  guideRefresh: 0.1,
};

const lerp = (r: readonly [number, number], t: number) => r[0] + (r[1] - r[0]) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _v = new Vector3();
const _c = new Color();

/** Where to draw the exit guide on screen; see `screenGuide`. */
export interface ScreenGuide {
  /** Position in normalised screen coordinates, -1..1 (y up), clamped to the edge when off screen. */
  x: number;
  y: number;
  /** Whether the target itself is visible in the frustum (else the marker is an edge arrow). */
  onScreen: boolean;
  /** Screen-space direction to the target, radians (0 = right, π/2 = up). */
  angle: number;
}

/**
 * The reactor escape as a set piece: red strobing lights, klaxon and
 * countdown voice, sparks and debris near the player, a guide toward the exit
 * and a rumble value for camera shake. Pure logic driven by the mission state;
 * the game applies the outputs to lights, fog and HUD, so tests can run it
 * headless with NO_EFFECTS / NO_SOUND.
 */
export class EscapeSequence {
  /** True while the mission is in its escape phase. */
  active = false;
  /** 0..1, how far along the countdown is (with the final seconds forced to panic). */
  urgency = 0;
  /** 0..1 camera shake intensity for the main thread to feed into camera shake. */
  rumble = 0;
  /** Current strobe frequency, Hz. */
  strobeHz = 0;
  /** Current strobe pulse, 0..1. */
  pulse = 0;
  /** 0..1 blend of the level lights toward the alarm colour (ramps in, 0 when inactive). */
  tint = 0;
  /** Level light intensity multiplier: slots of `phase` 0 and 1 strobe in anti-phase. */
  readonly lightScale: [number, number] = [1, 1];
  /** Intensity of the red ambient hemisphere light. */
  ambient = 0;
  /** 0..1 blend of fog and background toward `fogColor`. */
  fogTint = 0;
  readonly alarmColor = new Color(ESCAPE_TUNING.alarmColor);
  readonly fogColor = new Color(ESCAPE_TUNING.fogColor);
  /** Next point to fly toward on the way out, or null (no exit, inactive, already out). */
  guideTarget: Vector3 | null = null;
  /** Remaining portal hops to the exit along the BFS path, or -1. */
  guideHops = -1;

  private readonly exit: DoorState | null;
  private phase = 0;
  private time = 0;
  private klaxonTimer = 0;
  private sparkTimer = 0;
  private kick = 0;
  private lastSecond = -1;
  private guideTimer = 0;
  private guideSegment = -1;
  private path: number[] | null = null;
  private readonly target = new Vector3();

  constructor(
    private readonly level: Level,
    private readonly effects: Effects = NO_EFFECTS,
    private readonly emit: (p: ParticleSpec) => void = () => {},
    private readonly sound: SoundSink = NO_SOUND,
    private readonly rng: () => number = Math.random,
  ) {
    this.exit = level.doors.find((d) => d.exit) ?? null;
  }

  /**
   * Advances the sequence. `countdown` is the full escape time, `timeLeft`
   * what remains; `pos` / `segment` locate the player (alive or not).
   */
  update(dt: number, state: MissionState, timeLeft: number, countdown: number, pos: Vector3, segment: number): void {
    const t = ESCAPE_TUNING;
    const wasActive = this.active;
    this.active = state === 'escape';
    if (!this.active) {
      this.reset();
      return;
    }
    if (!wasActive) {
      this.time = 0;
      this.klaxonTimer = 0;
      this.sparkTimer = lerp(t.sparkInterval, 0) * 0.5;
      this.lastSecond = -1;
      this.guideTimer = 0;
    }
    this.time += dt;

    const u = Math.max(clamp01(1 - timeLeft / Math.max(1e-3, countdown)), clamp01(1 - timeLeft / t.finalSeconds));
    this.urgency = u;

    // Strobe: a raised cosine, faster and sharper as time runs out.
    this.strobeHz = lerp(t.strobeHz, Math.pow(u, t.strobeCurve));
    this.phase = (this.phase + dt * this.strobeHz) % 1;
    const sharp = lerp(t.strobeSharpness, u);
    const wave = (p: number) => Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * p), sharp);
    this.pulse = wave(this.phase);
    this.tint = Math.min(1, this.time / t.tintRampTime) * t.tintAmount;
    const floor = lerp(t.strobeFloor, u);
    const peak = lerp(t.strobePeak, u);
    // Blend from steady to strobing as the tint comes in, so the switch isn't abrupt.
    const on = this.tint / t.tintAmount;
    this.lightScale[0] = 1 + (floor + (peak - floor) * this.pulse - 1) * on;
    this.lightScale[1] = 1 + (floor + (peak - floor) * wave(this.phase + 0.5) - 1) * on;
    this.ambient = (t.ambient.base + lerp(t.ambient.pulse, u) * this.pulse) * on;
    this.fogTint = lerp(t.fogTint, u) * on;

    // Rumble rises with urgency; each shower adds a decaying kick.
    this.kick = Math.max(0, this.kick - dt * t.rumbleKickDecay);
    this.rumble = clamp01(lerp(t.rumble, Math.pow(u, t.rumbleCurve)) + this.kick);

    this.updateAudio(dt, timeLeft, u);
    this.updateSparks(dt, pos, segment, u);
    this.updateGuide(dt, pos, segment);
  }

  /** Level light colour for a light whose own colour is `base`. */
  tintColor(base: Color, out: Color): Color {
    return out.copy(base).lerp(this.alarmColor, this.tint);
  }

  private reset(): void {
    this.urgency = 0;
    this.rumble = 0;
    this.strobeHz = 0;
    this.pulse = 0;
    this.tint = 0;
    this.lightScale[0] = this.lightScale[1] = 1;
    this.ambient = 0;
    this.fogTint = 0;
    this.kick = 0;
    this.guideTarget = null;
    this.guideHops = -1;
    this.guideSegment = -1;
    this.path = null;
  }

  private updateAudio(dt: number, timeLeft: number, u: number): void {
    const t = ESCAPE_TUNING;
    this.klaxonTimer -= dt;
    if (this.klaxonTimer <= 0) {
      this.klaxonTimer += lerp(t.klaxonInterval, u);
      if (this.klaxonTimer <= 0) this.klaxonTimer = lerp(t.klaxonInterval, u);
      this.sound.play('klaxon', undefined, u);
    }
    // A voice-like count for the last ten seconds, one call per second.
    if (timeLeft < t.finalSeconds && timeLeft > 0) {
      const second = Math.ceil(timeLeft);
      if (second !== this.lastSecond) {
        this.lastSecond = second;
        this.sound.play('countdown', undefined, second);
      }
    }
  }

  private updateSparks(dt: number, pos: Vector3, segment: number, u: number): void {
    const t = ESCAPE_TUNING;
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0 || segment < 0) return;
    this.sparkTimer = lerp(t.sparkInterval, u) * (0.6 + 0.8 * this.rng());
    const walls = this.level.nearWalls(segment);
    if (!walls.length) return;
    let best = Infinity;
    for (let i = 0; i < t.sparkTries; i++) {
      const tri = walls[Math.floor(this.rng() * walls.length)];
      // Uniform point on the triangle.
      let r1 = this.rng();
      let r2 = this.rng();
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      _v.copy(tri.a).addScaledVector(_b.subVectors(tri.b, tri.a), r1).addScaledVector(_b.subVectors(tri.c, tri.a), r2);
      const d = _v.distanceTo(pos);
      if (d < best && d <= t.sparkRange) { best = d; _a.copy(_v); _n.copy(tri.n); }
    }
    if (best === Infinity) return;
    _a.addScaledVector(_n, 0.05);
    this.effects.impact(_a, _n, t.sparkColor);
    // Debris: dim embers and hot flecks falling from the hit point.
    const count = Math.round(lerp(t.debrisCount, u));
    for (let i = 0; i < count; i++) {
      _v.set(...t.gravity).multiplyScalar(lerp(t.debrisSpeed, this.rng()))
        .addScaledVector(_n, 0.5 + this.rng());
      _v.x += this.rng() - 0.5;
      _v.y += this.rng() - 0.5;
      _v.z += this.rng() - 0.5;
      if (this.rng() < 0.4) _c.set(t.sparkColor).multiplyScalar(2);
      else _c.set(t.debrisColor).multiplyScalar(0.8 + this.rng());
      // Particles copies the spec, so the scratch objects can be reused.
      this.emit({ position: _a, velocity: _v, color: _c, life: 0.8 + this.rng() * 0.8, drag: 0.6 });
    }
    this.kick = Math.min(t.rumbleKick, this.kick + t.rumbleKick * (1 - best / t.sparkRange));
  }

  private updateGuide(dt: number, pos: Vector3, segment: number): void {
    const exit = this.exit;
    if (!exit || segment < 0) { this.guideTarget = null; this.guideHops = -1; return; }
    if (segment !== this.guideSegment) {
      this.guideSegment = segment;
      this.path = this.level.findPath(segment, exit.child);
      this.guideTimer = 0;
    }
    const path = this.path;
    if (!path || path.length < 2) { this.guideTarget = null; this.guideHops = path ? 0 : -1; return; }
    this.guideHops = path.length - 1;
    this.guideTimer -= dt;
    if (this.guideTimer > 0 && this.guideTarget) return;
    this.guideTimer = ESCAPE_TUNING.guideRefresh;
    // Aim at the farthest portal ahead that is in plain sight; the next one otherwise.
    const last = Math.min(path.length - 1, ESCAPE_TUNING.guideLookahead);
    this.portalCenter(path[0], path[1], this.target);
    for (let i = last; i >= 2; i--) {
      this.portalCenter(path[i - 1], path[i], _a);
      if (this.level.lineOfSight(pos, segment, _a)) { this.target.copy(_a); break; }
    }
    this.guideTarget = this.target;
  }

  /** Centre of the portal from `seg` into its neighbour `next`. */
  private portalCenter(seg: number, next: number, out: Vector3): Vector3 {
    const side = this.level.segments[seg].children.indexOf(next);
    return this.level.sideCenter(seg, side, out);
  }
}

/**
 * Projects a world-space target for the HUD guide. Off-screen (or behind)
 * targets are pinned to an ellipse inset from the screen edge, pointing the
 * way to turn.
 */
export function screenGuide(target: Vector3, camera: Camera, inset = 0.85): ScreenGuide {
  camera.updateMatrixWorld();
  const local = _v.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const ndc = _a.copy(target).project(camera);
  const inFront = local.z < 0;
  if (inFront && Math.abs(ndc.x) <= inset && Math.abs(ndc.y) <= inset) {
    return { x: ndc.x, y: ndc.y, onScreen: true, angle: Math.atan2(ndc.y, ndc.x) };
  }
  // Direction in the view plane; straight behind defaults to "turn down".
  let dx = local.x;
  let dy = local.y;
  if (Math.hypot(dx, dy) < 1e-6) { dx = 0; dy = -1; }
  const angle = Math.atan2(dy, dx);
  return { x: Math.cos(angle) * inset, y: Math.sin(angle) * inset, onScreen: false, angle };
}
