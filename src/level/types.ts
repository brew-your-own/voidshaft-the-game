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

export interface LevelData {
  name: string;
  vertices: Vec3[];
  segments: SegmentData[];
  playerStart: { segment: number; position: Vec3; forward: Vec3 };
  lights: LightData[];
}
