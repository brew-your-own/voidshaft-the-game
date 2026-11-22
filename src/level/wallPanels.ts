import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import { GeometrySink } from '../render/GeometrySink';
import { WALL_KIND } from '../render/WallDetail';
import type { Level } from './Level';

/** Plate grid of one planar panel quad, for the wall detail shader. */
export interface PanelPlates {
  /** Whole plates along q0→q1 (u) and q0→q3 (v). */
  count: [number, number];
  /**
   * Plate size in metres, measured across the seams (perpendicular to them),
   * so grooves keep their width on sheared parallelograms.
   */
  size: [number, number];
}

const _eu = new Vector3();
const _ev = new Vector3();
const _t = new Vector3();

/**
 * Splits a panel quad (q0→q1 is u, q0→q3 is v) into whole plates close to
 * `plateSize`. Seams run parallel to the quad's edges.
 */
export function panelPlates(q: readonly Vector3[], plateSize: number): PanelPlates {
  _eu.subVectors(q[1], q[0]).add(_t.subVectors(q[2], q[3]));
  _ev.subVectors(q[3], q[0]).add(_t.subVectors(q[2], q[1]));
  const lenU = _eu.length() / 2, lenV = _ev.length() / 2;
  const sin = lenU > 0 && lenV > 0 ? _t.crossVectors(_eu, _ev).length() / (4 * lenU * lenV) : 1;
  const nu = Math.max(1, Math.round(lenU / plateSize));
  const nv = Math.max(1, Math.round(lenV / plateSize));
  return { count: [nu, nv], size: [(lenU / nu) * sin, (lenV / nv) * sin] };
}

export interface PanelDetail {
  plates: PanelPlates;
  /** Random value in [0, 1) that varies the plates of this panel. */
  seed: number;
  /** WALL_KIND.PLATE, or WALL_KIND.HAZARD + edge (0 u=0, 1 u=max, 2 v=0, 3 v=max). */
  kind: number;
  /** Segment colour, for glowing seams. */
  accent: Color;
}

/** Corner positions in plate units, in quad order. */
const CORNER_UV: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/**
 * GeometrySink that also writes the wall detail attributes:
 * wallUv (u, v in plates; plate counts), wallPanel (plate size u, v; kind;
 * seed) and wallAccent (rgb). Quads added with `quad()` get kind NONE.
 */
export class WallSink extends GeometrySink {
  readonly uv: number[] = [];
  readonly panel: number[] = [];
  readonly accent: number[] = [];

  override quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, inside: Vector3): void {
    this.detailQuad([a, b, c, d], color, inside, null);
  }

  detailQuad(q: readonly Vector3[], color: Color, inside: Vector3, detail: PanelDetail | null): void {
    this.corners(q, 0, 1, 2, color, inside, detail);
    this.corners(q, 0, 2, 3, color, inside, detail);
  }

  private corners(
    q: readonly Vector3[], a: number, b: number, c: number,
    color: Color, inside: Vector3, detail: PanelDetail | null,
  ): void {
    const order = this.tri(q[a], q[b], q[c], color, inside) ? [a, c, b] : [a, b, c];
    for (const k of order) {
      if (!detail) {
        this.uv.push(0, 0, 0, 0);
        this.panel.push(0, 0, WALL_KIND.NONE, 0);
        this.accent.push(0, 0, 0);
        continue;
      }
      const [nu, nv] = detail.plates.count;
      this.uv.push(CORNER_UV[k][0] * nu, CORNER_UV[k][1] * nv, nu, nv);
      this.panel.push(detail.plates.size[0], detail.plates.size[1], detail.kind, detail.seed);
      this.accent.push(detail.accent.r, detail.accent.g, detail.accent.b);
    }
  }

  override toGeometry(withNormals: boolean): BufferGeometry {
    const g = super.toGeometry(withNormals);
    const n = this.pos.length / 3;
    if (this.uv.length !== n * 4 || this.panel.length !== n * 4 || this.accent.length !== n * 3) {
      throw new Error('WallSink: detail attributes out of step with vertices (use quad/detailQuad, not tri)');
    }
    g.setAttribute('wallUv', new Float32BufferAttribute(this.uv, 4));
    g.setAttribute('wallPanel', new Float32BufferAttribute(this.panel, 4));
    g.setAttribute('wallAccent', new Float32BufferAttribute(this.accent, 3));
    return g;
  }
}

const near = (a: Vector3, b: Vector3) => a.distanceToSquared(b) < 1e-8;

/**
 * Edges of wall `side` of segment `seg` that border a door portal, as quad
 * edge indices k (edge k runs from quad[k] to quad[k + 1]).
 */
export function doorEdges(level: Level, seg: number, side: number): number[] {
  const segment = level.segments[seg];
  const q = segment.sides[side].quad;
  const edges: number[] = [];
  for (let d = 0; d < 6; d++) {
    if (d === side || !level.doorAt(seg, d)) continue;
    const portal = segment.sides[d].quad;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4];
      if (portal.some((p) => near(p, a)) && portal.some((p) => near(p, b)) && !edges.includes(k)) edges.push(k);
    }
  }
  return edges;
}

/**
 * Hazard edge (as encoded in WALL_KIND.HAZARD + edge) for panel (i, j) of an
 * nu × nv panel grid on a face whose door edges are `edges`, or -1.
 */
export function hazardEdge(edges: readonly number[], i: number, j: number, nu: number, nv: number): number {
  for (const k of edges) {
    if (k === 0 && j === 0) return 2; // q0→q1: v = 0
    if (k === 1 && i === nu - 1) return 1; // q1→q2: u = max
    if (k === 2 && j === nv - 1) return 3; // q2→q3: v = max
    if (k === 3 && i === 0) return 0; // q3→q0: u = 0
  }
  return -1;
}
