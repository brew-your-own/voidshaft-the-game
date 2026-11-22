import { PALETTE } from '../../render/palette';
import type { GridLayout } from '../GridLayout';
import type { LevelBuilder } from '../LevelBuilder';
import type { RobotType, Vec3 } from '../types';

/**
 * Reactor chamber grown off a wall: a flare, the chamber with the reactor
 * and its three pylons, and a narrow back cap. Returns the chamber segment.
 */
export function reactorChamber(
  b: LevelBuilder, from: number, side: number, color: number, countdown: number,
): { flare: number; chamber: number; back: number } {
  const flare = b.extrude(from, side, { length: 4, scale: 2.2, color });
  const chamber = b.extrude(flare, side, { length: 18 });
  const back = b.extrude(chamber, side, { length: 4, scale: 0.5 });
  b.addLight(chamber, color, 70, 40);
  b.addLight(back, PALETTE.amber, 20, 15);
  b.reactor(chamber, [0, 0, 0], [[5, 3.5, 0], [-5, -1.75, 3], [0, -2, -4]], countdown);
  b.robot(flare, 'stinger', [0, 3, 0]);
  b.robot(back, 'stinger');
  b.pickup(flare, 'shield', [0, -3, 0]);
  b.pickup(chamber, 'missiles', [0, -5, 0]);
  return { flare, chamber, back };
}

/** Exit door on `side` of `from`, then a short tunnel out of the mine. */
export function exitTunnel(b: LevelBuilder, from: number, side: number): number {
  const neck = b.extrude(from, side, { length: 6, scale: 0.8, color: PALETTE.white });
  b.exit(from, side);
  const end = b.tunnel(neck, side, [{ length: 10 }, { length: 10, scale: 1.3 }]);
  b.addLight(end, PALETTE.white, 60, 30);
  return end;
}

/** One placement per line: [type or kind, column, row, floor?, offset?]. */
export type Placement<T extends string> = [T, number, number, number?, Vec3?];

/** Places robots by grid cell. */
export function robots(b: LevelBuilder, g: GridLayout, list: Placement<RobotType>[]): void {
  for (const [type, col, row, floor = 0, offset] of list) b.robot(g.at(col, row, floor), type, offset);
}

/** Places pickups by grid cell. */
export function pickups(b: LevelBuilder, g: GridLayout, list: Placement<'shield' | 'energy' | 'missiles'>[]): void {
  for (const [kind, col, row, floor = 0, offset] of list) b.pickup(g.at(col, row, floor), kind, offset);
}

/**
 * Grid cells are small next to the rooms of the first level, so their
 * walls sit close to the lamp: authored intensities are scaled down.
 */
const GRID_LIGHT_SCALE = 0.4;

/** Places lights by grid cell: [colour, column, row, floor?, intensity?]. */
export function lights(b: LevelBuilder, g: GridLayout, list: [number, number, number, number?, number?][]): void {
  for (const [color, col, row, floor = 0, intensity = 35] of list) {
    b.addLight(g.at(col, row, floor), color, intensity * GRID_LIGHT_SCALE, 22);
  }
}
