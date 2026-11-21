import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { createLedMaterial, createWallMaterial } from '../render/Materials';
import { PALETTE } from '../render/palette';
import { bilerp } from './geometry';
import type { Level, Segment } from './Level';

const PANEL_SIZE = 2.6;
const PANEL_INSET = 0.1; // fraction of panel size used for the bevel
const PANEL_RAISE = 0.07; // how far panels stick out of the wall
const LED_WIDTH = 0.1;
const LED_GLOW = 2.0;
const DOT_CHANCE = 0.1;

class GeometrySink {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  private readonly ab = new Vector3();
  private readonly ac = new Vector3();
  private readonly n = new Vector3();

  /** Adds a triangle wound to face `inside`. */
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color, inside: Vector3): void {
    this.n.crossVectors(this.ab.subVectors(b, a), this.ac.subVectors(c, a));
    if (this.n.dot(this.ab.subVectors(inside, a)) < 0) {
      [b, c] = [c, b];
      this.n.negate();
    }
    this.n.normalize();
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, inside: Vector3): void {
    this.tri(a, b, c, color, inside);
    this.tri(a, c, d, color, inside);
  }

  toGeometry(withNormals: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    if (withNormals) g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Deterministic PRNG so the level looks the same every load. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the render meshes for all walls: bevelled panels plus LED strips. */
export function buildLevelMesh(level: Level): Group {
  const walls = new GeometrySink();
  const leds = new GeometrySink();
  const rng = mulberry32(1337);
  const base = new Color(PALETTE.wall);
  const white = new Color(PALETTE.white);

  for (const seg of level.segments) {
    const accent = new Color(seg.color);
    seg.sides.forEach((side) => {
      if (side.isWall) buildWall(seg, side.quad, walls, leds, rng, base, accent, white);
    });
  }

  const group = new Group();
  group.name = 'level';
  group.add(new Mesh(walls.toGeometry(true), createWallMaterial()));
  group.add(new Mesh(leds.toGeometry(false), createLedMaterial()));
  return group;
}

function buildWall(
  seg: Segment, q: Vector3[], walls: GeometrySink, leds: GeometrySink,
  rng: () => number, base: Color, accent: Color, white: Color,
): void {
  const inside = seg.center;
  const lenU = (q[0].distanceTo(q[1]) + q[3].distanceTo(q[2])) / 2;
  const lenV = (q[0].distanceTo(q[3]) + q[1].distanceTo(q[2])) / 2;
  const nu = Math.max(1, Math.round(lenU / PANEL_SIZE));
  const nv = Math.max(1, Math.round(lenV / PANEL_SIZE));

  // Inward normal of the whole face, used to raise panels and LEDs.
  const normal = new Vector3().subVectors(q[2], q[0]).cross(new Vector3().subVectors(q[3], q[1])).normalize();
  const faceCenter = bilerp(q, 0.5, 0.5);
  if (normal.dot(new Vector3().subVectors(inside, faceCenter)) < 0) normal.negate();

  // Floors read darker, ceilings slightly lighter.
  const tilt = normal.y > 0.6 ? 0.7 : normal.y < -0.6 ? 1.1 : 1;
  const insetU = PANEL_INSET / nu;
  const insetV = PANEL_INSET / nv;

  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
      const outer = [bilerp(q, u0, v0), bilerp(q, u1, v0), bilerp(q, u1, v1), bilerp(q, u0, v1)];
      const inner = [
        bilerp(q, u0 + insetU, v0 + insetV), bilerp(q, u1 - insetU, v0 + insetV),
        bilerp(q, u1 - insetU, v1 - insetV), bilerp(q, u0 + insetU, v1 - insetV),
      ].map((p) => p.addScaledVector(normal, PANEL_RAISE));

      const shade = base.clone().multiplyScalar(tilt * (0.75 + rng() * 0.5)).lerp(accent, 0.04);
      walls.quad(inner[0], inner[1], inner[2], inner[3], shade, inside);
      const bevel = shade.clone().multiplyScalar(0.55);
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4;
        walls.quad(outer[k], outer[k1], inner[k1], inner[k], bevel, inside);
      }

      if (rng() < DOT_CHANCE) {
        const du = (u1 - u0) * 0.18, dv = (v1 - v0) * 0.18;
        const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
        const dot = [
          bilerp(q, cu - du, cv - dv), bilerp(q, cu + du, cv - dv),
          bilerp(q, cu + du, cv + dv), bilerp(q, cu - du, cv + dv),
        ].map((p) => p.addScaledVector(normal, PANEL_RAISE + 0.02));
        const glow = (rng() < 0.6 ? accent : white).clone().multiplyScalar(LED_GLOW * 1.3);
        leds.quad(dot[0], dot[1], dot[2], dot[3], glow, inside);
      }
    }
  }

  // LED strips along the four edges of the wall.
  const glow = accent.clone().multiplyScalar(LED_GLOW);
  for (let k = 0; k < 4; k++) {
    const a = q[k], b = q[(k + 1) % 4];
    const along = new Vector3().subVectors(b, a);
    const w = new Vector3().crossVectors(normal, along).normalize();
    if (w.dot(new Vector3().subVectors(faceCenter, a)) < 0) w.negate();
    const lift = normal.clone().multiplyScalar(PANEL_RAISE + 0.03);
    const a0 = a.clone().add(lift).addScaledVector(w, 0.06);
    const b0 = b.clone().add(lift).addScaledVector(w, 0.06);
    const a1 = a0.clone().addScaledVector(w, LED_WIDTH);
    const b1 = b0.clone().addScaledVector(w, LED_WIDTH);
    leds.quad(a0, b0, b1, a1, glow, inside);
  }
}
