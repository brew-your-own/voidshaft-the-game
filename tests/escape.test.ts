import { Color, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SoundName } from '../src/audio/Audio';
import { NO_EFFECTS, type Effects } from '../src/combat/types';
import { ESCAPE_TUNING, EscapeSequence, screenGuide } from '../src/fx/EscapeSequence';
import type { ParticleSpec } from '../src/fx/Particles';
import { StaticLights } from '../src/fx/StaticLights';
import { SIDE } from '../src/level/geometry';
import { Level } from '../src/level/Level';
import { LevelBuilder } from '../src/level/LevelBuilder';
import { buildLevel01 } from '../src/level/levels/level01';

/**
 * A corridor with a bend: start → b → c straight ahead, then a long room d to
 * the left of c, and the exit door in d's ceiling up into e.
 */
function corridor() {
  const lb = new LevelBuilder();
  const start = lb.addBox([0, 0, 0], [4, 4, 4], 0xffffff);
  const b = lb.extrude(start, SIDE.FRONT, { length: 4 });
  const c = lb.extrude(b, SIDE.FRONT, { length: 4 });
  const d = lb.extrude(c, SIDE.LEFT, { length: 8 });
  const e = lb.extrude(d, SIDE.TOP, { length: 4 });
  lb.exit(d, SIDE.TOP);
  lb.addLight(start, 0x00ffff);
  return { level: new Level(lb.build('t', start, [0, 0, 1])), start, b, c, d, e };
}

/** Runs a fresh sequence from the start of the escape to `timeLeft`. */
function runTo(seq: EscapeSequence, level: Level, countdown: number, timeLeft: number, seg = 0) {
  const pos = level.segments[seg].center;
  const dt = 1 / 60;
  for (let t = countdown; t > timeLeft; t -= dt) seq.update(dt, 'escape', Math.max(timeLeft, t - dt), countdown, pos, seg);
}

describe('EscapeSequence', () => {
  it('stays idle outside the escape', () => {
    const { level } = corridor();
    const seq = new EscapeSequence(level);
    seq.update(0.1, 'active', 0, 30, new Vector3(), 0);
    expect(seq.active).toBe(false);
    expect(seq.rumble).toBe(0);
    expect(seq.tint).toBe(0);
    expect(seq.lightScale).toEqual([1, 1]);
    expect(seq.guideTarget).toBeNull();
  });

  it('rumble, strobe rate and urgency rise as time runs out', () => {
    const { level } = corridor();
    const samples = [50, 30, 15, 5, 0.5].map((left) => {
      const seq = new EscapeSequence(level, NO_EFFECTS, () => {}, undefined, () => 0.5);
      runTo(seq, level, 60, left);
      return seq;
    });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].urgency).toBeGreaterThan(samples[i - 1].urgency);
      expect(samples[i].strobeHz).toBeGreaterThan(samples[i - 1].strobeHz);
      expect(samples[i].rumble).toBeGreaterThanOrEqual(samples[i - 1].rumble);
    }
    expect(samples[0].rumble).toBeGreaterThan(0);
    expect(samples.at(-1)!.rumble).toBeLessThanOrEqual(1);
    expect(samples.at(-1)!.strobeHz).toBeCloseTo(ESCAPE_TUNING.strobeHz[1], 0);
  });

  it('the last seconds count as panic even with a long countdown', () => {
    const { level } = corridor();
    const seq = new EscapeSequence(level);
    runTo(seq, level, 300, 1);
    expect(seq.urgency).toBeGreaterThan(0.85);
  });

  it('tints and strobes the static lights only during the escape', () => {
    const { level } = corridor();
    const lights = new StaticLights(level.data.lights, 1);
    const light = lights.pointLights[0];
    const base = new Color(0x00ffff);
    const seq = new EscapeSequence(level);
    const apply = () => {
      lights.setAlarm(seq.alarmColor, seq.tint, seq.lightScale[0], seq.lightScale[1]);
      lights.update(1 / 60, new Vector3());
    };
    apply();
    expect(light.color.equals(base)).toBe(true);
    const steady = light.intensity;

    runTo(seq, level, 30, 20);
    apply();
    expect(seq.tint).toBeCloseTo(ESCAPE_TUNING.tintAmount);
    expect(light.color.r).toBeGreaterThan(0.8);
    expect(light.color.b).toBeLessThan(0.3);
    // The strobe moves the intensity over a cycle.
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) {
      seq.update(1 / 60, 'escape', 20 - i / 60, 30, new Vector3(), 0);
      apply();
      seen.add(Math.round(light.intensity / steady * 20));
    }
    expect(seen.size).toBeGreaterThan(5);

    seq.update(1 / 60, 'won', 10, 30, new Vector3(), 0);
    apply();
    expect(light.color.equals(base)).toBe(true);
    expect(light.intensity).toBeCloseTo(steady);
  });

  it('never changes the number of lights', () => {
    const { level } = corridor();
    const lights = new StaticLights(level.data.lights, 1);
    const before = lights.object.children.length;
    const seq = new EscapeSequence(level);
    runTo(seq, level, 10, 0.1);
    lights.setAlarm(seq.alarmColor, seq.tint, seq.lightScale[0], seq.lightScale[1]);
    lights.update(0.1, new Vector3());
    expect(lights.object.children.length).toBe(before);
  });

  it('klaxon repeats faster as time runs out, and the last ten seconds are counted', () => {
    const { level } = corridor();
    const played: { name: SoundName; at: number; scale?: number }[] = [];
    let now = 0;
    const seq = new EscapeSequence(level, NO_EFFECTS, () => {}, { play: (name, _p, scale) => played.push({ name, at: now, scale }) });
    const dt = 1 / 60;
    for (let t = 60; t > 0.01; t -= dt) {
      now = 60 - t;
      seq.update(dt, 'escape', t, 60, level.segments[0].center, 0);
    }
    const klaxons = played.filter((p) => p.name === 'klaxon').map((p) => p.at);
    const gapEarly = klaxons[1] - klaxons[0];
    const gapLate = klaxons.at(-1)! - klaxons.at(-2)!;
    expect(gapLate).toBeLessThan(gapEarly);
    const counts = played.filter((p) => p.name === 'countdown').map((p) => p.scale);
    expect(counts).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('showers sparks and debris near the player, more often as time runs out', () => {
    const { level } = corridor();
    const at = level.segments[0].center;
    let phase: 'early' | 'mid' | 'late' = 'early';
    const impacts = { early: 0, mid: 0, late: 0 };
    let debris = 0;
    const effects: Effects = { ...NO_EFFECTS, impact: (pos) => {
      impacts[phase]++;
      expect(pos.distanceTo(at)).toBeLessThanOrEqual(ESCAPE_TUNING.sparkRange + 0.1);
    } };
    const seq = new EscapeSequence(level, effects, (_p: ParticleSpec) => { debris++; });
    const dt = 1 / 60;
    for (let t = 60; t > 0.01; t -= dt) {
      phase = t > 50 ? 'early' : t < 10 ? 'late' : 'mid';
      seq.update(dt, 'escape', t, 60, at, 0);
    }
    // Same 10 s window at the start and at the end.
    expect(impacts.early).toBeGreaterThan(0);
    expect(impacts.late).toBeGreaterThan(impacts.early * 2);
    expect(debris).toBeGreaterThan(0);
  });

  it('guides along the BFS path to the exit, as far ahead as it can see', () => {
    const { level, start, b, c, d, e } = corridor();
    const seq = new EscapeSequence(level);
    const portal = (s: number, side: number) => level.sideCenter(s, side);
    const at = (seg: number, dt = 0.2) => seq.update(dt, 'escape', 20, 30, level.segments[seg].center, seg);

    // From the start, the bend into d is in sight; the lookahead stops there.
    at(start);
    expect(seq.guideHops).toBe(4);
    expect(seq.guideTarget!.distanceTo(portal(c, SIDE.LEFT))).toBeLessThan(1e-6);

    // From b the exit hatch is hidden behind the bend, so aim at the bend.
    at(b);
    expect(seq.guideHops).toBe(3);
    expect(seq.guideTarget!.distanceTo(portal(c, SIDE.LEFT))).toBeLessThan(1e-6);

    // From c, and from d, the exit hatch itself.
    at(c);
    expect(seq.guideHops).toBe(2);
    expect(seq.guideTarget!.distanceTo(portal(d, SIDE.TOP))).toBeLessThan(1e-6);
    at(d);
    expect(seq.guideHops).toBe(1);
    expect(seq.guideTarget!.distanceTo(portal(d, SIDE.TOP))).toBeLessThan(1e-6);

    // Out through the exit: nothing left to point at.
    at(e);
    expect(seq.guideTarget).toBeNull();
    expect(seq.guideHops).toBe(0);
  });

  it('finds a way out of every room of level01', () => {
    const level = new Level(buildLevel01());
    const exit = level.doors.find((dd) => dd.exit)!;
    for (const s of level.segments) {
      if (s.index === exit.child) continue;
      const seq = new EscapeSequence(level);
      seq.update(0.1, 'escape', 20, 30, s.center, s.index);
      expect(seq.guideTarget, `segment ${s.index}`).not.toBeNull();
      const path = level.findPath(s.index, exit.child)!;
      expect(seq.guideHops).toBe(path.length - 1);
    }
  });
});

describe('screenGuide', () => {
  const camera = new PerspectiveCamera(80, 1, 0.05, 400);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  it('marks a target in front of the camera on screen', () => {
    const g = screenGuide(new Vector3(0, 0, -10), camera);
    expect(g.onScreen).toBe(true);
    expect(g.x).toBeCloseTo(0);
    expect(g.y).toBeCloseTo(0);
  });

  it('pins targets off to the side or behind to the edge, pointing the way to turn', () => {
    const right = screenGuide(new Vector3(10, 0, 1), camera);
    expect(right.onScreen).toBe(false);
    expect(right.x).toBeGreaterThan(0.5);
    expect(right.angle).toBeCloseTo(0);
    const up = screenGuide(new Vector3(0, 10, 5), camera);
    expect(up.onScreen).toBe(false);
    expect(up.angle).toBeCloseTo(Math.PI / 2);
    const behind = screenGuide(new Vector3(0, 0, 10), camera);
    expect(behind.onScreen).toBe(false);
    expect(Math.hypot(behind.x, behind.y)).toBeCloseTo(0.85);
  });
});
