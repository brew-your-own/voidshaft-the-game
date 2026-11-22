import { Vector3 } from 'three';
import { mulberry32 } from '../render/GeometrySink';
import { SIDE } from './geometry';
import type { LevelBuilder } from './LevelBuilder';
import type { KeyColor, Vec3 } from './types';

/** Cell size along one axis: one value, or one value per index (repeating). */
export type AxisSize = number | readonly number[];

export interface GridOptions {
  /** Cell sizes along x (columns), y (floors) and z (rows). */
  size: [AxisSize, AxisSize, AxisSize];
  origin?: Vec3;
  /**
   * Amplitude of the random shear. Each lattice coordinate gets offsets that
   * depend on the other two indices separately, so faces stay planar
   * (parallelograms) while floors ramp and walls lean.
   */
  warp?: number;
  seed?: number;
  /** Accent colour of every character used in the maps. */
  legend: Record<string, number>;
  /** Pairs of characters ("ab") whose adjacent cells are not linked. */
  separate?: string[];
}

interface Cell {
  ch: string;
  x: number;
  y: number;
  z: number;
  seg: number;
}

/** Direction of each side in grid steps. */
const STEP: Record<number, [number, number, number]> = {
  [SIDE.LEFT]: [-1, 0, 0], [SIDE.RIGHT]: [1, 0, 0],
  [SIDE.BOTTOM]: [0, -1, 0], [SIDE.TOP]: [0, 1, 0],
  [SIDE.BACK]: [0, 0, -1], [SIDE.FRONT]: [0, 0, 1],
};

/**
 * Lays out a level as ASCII maps on a 3D lattice: each character is one
 * cube segment, `.` or space is rock. Floors stack upwards (y); in a floor,
 * rows run along +z and characters along +x. Face-adjacent cells are linked
 * (unless listed in `separate`), so rooms are blocks of cells and loops come
 * for free. Cells share lattice vertices, so they never overlap.
 *
 * Usage: `floor()` for every floor, then `build()`, then look cells up by
 * character to place things or doors.
 */
export class GridLayout {
  private readonly floors = new Map<number, string[]>();
  private readonly cellMap = new Map<string, Cell>();
  private readonly byChar = new Map<string, Cell[]>();
  private readonly lattice = new Map<string, number>();
  private readonly offsets: { x: number[][]; y: number[][]; z: number[][] };
  private built = false;

  constructor(private readonly b: LevelBuilder, private readonly opts: GridOptions) {
    const rng = mulberry32(opts.seed ?? 1);
    const warp = opts.warp ?? 0;
    const table = () => Array.from({ length: 64 }, () => (rng() * 2 - 1) * warp);
    // x' = X(i) + f(j) + g(k), and likewise for y and z.
    this.offsets = { x: [table(), table()], y: [table(), table()], z: [table(), table()] };
  }

  /** Adds a floor map at height index `y`. */
  floor(y: number, rows: string[]): this {
    if (this.built) throw new Error('GridLayout: floor() after build()');
    this.floors.set(y, rows);
    return this;
  }

  /** Creates the segments and links neighbouring cells. */
  build(): this {
    for (const [y, rows] of this.floors) {
      rows.forEach((row, z) => {
        [...row].forEach((ch, x) => {
          if (ch === '.' || ch === ' ') return;
          const color = this.opts.legend[ch];
          if (color === undefined) throw new Error(`GridLayout: '${ch}' is not in the legend`);
          const verts = [
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
          ].map(([dx, dy, dz]) => this.latticeVertex(x + dx, y + dy, z + dz));
          const cell: Cell = { ch, x, y, z, seg: this.b.addSegment(verts, color) };
          this.cellMap.set(key(x, y, z), cell);
          const list = this.byChar.get(ch) ?? [];
          list.push(cell);
          this.byChar.set(ch, list);
        });
      });
    }
    const separate = new Set((this.opts.separate ?? []).flatMap((p) => [p, [...p].reverse().join('')]));
    for (const cell of this.cellMap.values()) {
      for (const side of [SIDE.RIGHT, SIDE.TOP, SIDE.FRONT]) {
        const n = this.neighbour(cell, side);
        if (n && !separate.has(cell.ch + n.ch)) this.b.link(cell.seg, side, n.seg);
      }
    }
    this.built = true;
    return this;
  }

  /** Segments of every cell drawn with `ch`, in map reading order. */
  cells(ch: string): number[] {
    const list = this.byChar.get(ch);
    if (!list) throw new Error(`GridLayout: no cells drawn with '${ch}'`);
    return list.map((c) => c.seg);
  }

  /** Segment of the only cell drawn with `ch`. */
  one(ch: string): number {
    const list = this.cells(ch);
    if (list.length !== 1) throw new Error(`GridLayout: '${ch}' has ${list.length} cells, expected 1`);
    return list[0];
  }

  /** Segment of the cell at map column `col`, row `row` on `floor`; throws on rock. */
  at(col: number, row: number, floor = 0): number {
    const cell = this.cellMap.get(key(col, floor, row));
    if (!cell) throw new Error(`GridLayout: rock at column ${col}, row ${row}, floor ${floor}`);
    return cell.seg;
  }

  /**
   * The only portal between a cell drawn with `from` and one drawn with
   * `to`, as the segment and side on the `from` side.
   */
  portal(from: string, to: string): { segment: number; side: number } {
    const found: { segment: number; side: number }[] = [];
    for (const cell of this.byChar.get(from) ?? []) {
      for (let side = 0; side < 6; side++) {
        const n = this.neighbour(cell, side);
        if (n?.ch === to && this.b.segments[cell.seg].children[side] === n.seg) found.push({ segment: cell.seg, side });
      }
    }
    if (found.length !== 1) throw new Error(`GridLayout: ${found.length} portals between '${from}' and '${to}', expected 1`);
    return found[0];
  }

  /** Puts a door on the only portal between `from` and `to` cells. */
  door(from: string, to: string, key: KeyColor | null = null): void {
    const p = this.portal(from, to);
    this.b.door(p.segment, p.side, key);
  }

  /** Puts the exit door on the only portal between `from` and `to` cells. */
  exit(from: string, to: string): void {
    const p = this.portal(from, to);
    this.b.exit(p.segment, p.side);
  }

  /** Free (unlinked) wall sides of a cell, for extruding off-grid parts. */
  isWall(seg: number, side: number): boolean {
    return this.b.segments[seg].children[side] === -1;
  }

  private neighbour(cell: Cell, side: number): Cell | undefined {
    const [dx, dy, dz] = STEP[side];
    return this.cellMap.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
  }

  private latticeVertex(i: number, j: number, k: number): number {
    const id = key(i, j, k);
    let v = this.lattice.get(id);
    if (v === undefined) {
      const [sx, sy, sz] = this.opts.size;
      const o = this.opts.origin ?? [0, 0, 0];
      const { x, y, z } = this.offsets;
      v = this.b.addVertex(new Vector3(
        o[0] + edge(sx, i) + x[0][wrap(j)] + x[1][wrap(k)],
        o[1] + edge(sy, j) + y[0][wrap(i)] + y[1][wrap(k)],
        o[2] + edge(sz, k) + z[0][wrap(i)] + z[1][wrap(j)],
      ));
      this.lattice.set(id, v);
    }
    return v;
  }
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function wrap(n: number): number {
  return ((n % 64) + 64) % 64;
}

/** Position of lattice line `n` along an axis (cumulative cell sizes). */
function edge(size: AxisSize, n: number): number {
  if (typeof size === 'number') return size * n;
  let sum = 0;
  if (n >= 0) for (let i = 0; i < n; i++) sum += size[i % size.length];
  else for (let i = -1; i >= n; i--) sum -= size[((i % size.length) + size.length) % size.length];
  return sum;
}
