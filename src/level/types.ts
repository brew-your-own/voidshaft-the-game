export type Vec3 = [number, number, number];

/**
 * A segment is a deformable cube (hexahedron) defined by 8 vertex indices.
 *
 * Local vertex layout (signs of x, y, z in the segment's own frame):
 *   0(-,-,-) 1(+,-,-) 2(+,+,-) 3(-,+,-)
 *   4(-,-,+) 5(+,-,+) 6(+,+,+) 7(-,+,+)
 *
 * Sides: 0 LEFT(-x) 1 RIGHT(+x) 2 BOTTOM(-y) 3 TOP(+y) 4 BACK(-z) 5 FRONT(+z).
 * children[side] is the neighbouring segment index, or -1 for a solid wall.
 */
export interface SegmentData {
  verts: number[];
  children: number[];
  /** Accent (LED) colour of this segment, as 0xRRGGBB. */
  color: number;
}

export interface LightData {
  position: Vec3;
  color: number;
  intensity: number;
  distance: number;
}

export type KeyColor = 'red' | 'gold' | 'blue';
export const KEY_COLORS: readonly KeyColor[] = ['red', 'gold', 'blue'];

/** A door filling the portal between `segment` and its child on `side`. */
export interface DoorData {
  segment: number;
  side: number;
  /** Key needed to open it, or null for an unlocked door. */
  key: KeyColor | null;
}

export interface KeyData {
  color: KeyColor;
  segment: number;
  position: Vec3;
}

export type PickupKind = 'shield' | 'energy' | 'missiles';

export interface PickupData {
  kind: PickupKind;
  segment: number;
  position: Vec3;
}

/** Stationary destructible practice target (firing range). */
export interface TargetData {
  segment: number;
  position: Vec3;
}

/** Robot archetypes; behaviour and tuning live in entities/robots. */
export type RobotType = 'stinger' | 'bulwark' | 'fuse';
export const ROBOT_TYPES: readonly RobotType[] = ['stinger', 'bulwark', 'fuse'];

export interface RobotData {
  type: RobotType;
  segment: number;
  position: Vec3;
}

export interface LevelData {
  name: string;
  vertices: Vec3[];
  segments: SegmentData[];
  playerStart: { segment: number; position: Vec3; forward: Vec3 };
  lights: LightData[];
  doors: DoorData[];
  keys: KeyData[];
  pickups: PickupData[];
  targets: TargetData[];
  robots: RobotData[];
}
