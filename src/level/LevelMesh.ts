import { Color, Group, Mesh, Vector3 } from 'three';
import { GeometrySink, mulberry32 } from '../render/GeometrySink';
import { createLedMaterial, createWallMaterial } from '../render/Materials';
import { PALETTE } from '../render/palette';
import { WALL_DETAIL_TUNING, WALL_KIND } from '../render/WallDetail';
import { bilerp } from './geometry';
import type { Level, Segment } from './Level';
import { doorEdges, hazardEdge, panelPlates, WallSink } from './wallPanels';

const PANEL_SIZE = 2.6;
const PANEL_INSET = 0.1; // fraction of panel size used for the bevel
const PANEL_RAISE = 0.07; // how far panels stick out of the wall
const LED_WIDTH = 0.1;
const LED_GLOW = 2.0;
const DOT_CHANCE = 0.1;

export interface LevelMeshes {
  root: Group;
  /** One group per segment (walls + LEDs), toggled by portal culling. */
  segments: Group[];
}

/** Builds the render meshes for all walls: bevelled panels plus LED strips. */
export function buildLevelMesh(level: Level): LevelMeshes {
  const rng = mulberry32(1337);
  // Separate stream so the detail seeds don't change the panel shades and LED dots.
  const detailRng = mulberry32(4242);
  const base = new Color(PALETTE.wall);
  const white = new Color(PALETTE.white);
  const wallMaterial = createWallMaterial();
  const ledMaterial = createLedMaterial();
  const root = new Group();
  root.name = 'level';

  const segments = level.segments.map((seg) => {
    const walls = new WallSink();
    const leds = new GeometrySink();
    const accent = new Color(seg.color);
    seg.sides.forEach((side, s) => {
      if (!side.isWall) return;
      const wall: WallContext = { walls, leds, rng, detailRng, base, accent, white, doorEdges: doorEdges(level, seg.index, s) };
      buildWall(seg, side.quad, wall);
    });
    const group = new Group();
    group.name = `segment-${seg.index}`;
    if (walls.pos.length) group.add(new Mesh(walls.toGeometry(true), wallMaterial));
    if (leds.pos.length) group.add(new Mesh(leds.toGeometry(false), ledMaterial));
    root.add(group);
    return group;
  });
  return { root, segments };
}

interface WallContext {
  walls: WallSink;
  leds: GeometrySink;
  rng: () => number;
  detailRng: () => number;
  base: Color;
  accent: Color;
  white: Color;
  /** Edges of this wall that border a door portal (hazard stripes). */
  doorEdges: number[];
}

function buildWall(seg: Segment, q: Vector3[], ctx: WallContext): void {
  const { walls, leds, rng, detailRng, base, accent, white } = ctx;
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
      const hazard = hazardEdge(ctx.doorEdges, i, j, nu, nv);
      walls.detailQuad(inner, shade, inside, WALL_DETAIL_TUNING.enabled ? {
        plates: panelPlates(inner, WALL_DETAIL_TUNING.plateSize),
        seed: detailRng(),
        kind: hazard < 0 ? WALL_KIND.PLATE : WALL_KIND.HAZARD + hazard,
        accent,
      } : null);
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
