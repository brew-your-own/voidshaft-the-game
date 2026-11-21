import { SIDE_VERTS, OPPOSITE, partnerVertex } from './geometry';
import type { LevelData } from './types';

/** Fetches a level exported by `npm run levels` and validates it. */
export async function loadLevel(id: string): Promise<LevelData> {
  const res = await fetch(`${import.meta.env.BASE_URL}levels/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load level ${id}: ${res.status}`);
  const data = (await res.json()) as LevelData;
  const errors = validateLevel(data);
  if (errors.length) throw new Error(`Invalid level ${id}:\n${errors.join('\n')}`);
  return data;
}

/** Structural checks: indices in range, portals symmetric and sharing their face. */
export function validateLevel(data: LevelData): string[] {
  const errors: string[] = [];
  const nSeg = data.segments.length;
  data.segments.forEach((seg, i) => {
    if (seg.verts.length !== 8 || seg.verts.some((v) => v < 0 || v >= data.vertices.length)) {
      errors.push(`segment ${i}: bad vertex indices`);
    }
    seg.children.forEach((c, side) => {
      if (c < 0) return;
      if (c >= nSeg) { errors.push(`segment ${i} side ${side}: child ${c} out of range`); return; }
      const back = data.segments[c].children[OPPOSITE[side]];
      if (back !== i) errors.push(`segment ${i} side ${side}: child ${c} does not link back`);
      for (const lv of SIDE_VERTS[side]) {
        if (seg.verts[lv] !== data.segments[c].verts[partnerVertex(side, lv)]) {
          errors.push(`segment ${i} side ${side}: face not shared with ${c}`);
          break;
        }
      }
    });
  });
  for (const d of data.doors) {
    if (data.segments[d.segment]?.children[d.side] === undefined || data.segments[d.segment].children[d.side] < 0) {
      errors.push(`door at ${d.segment}:${d.side} is not on a portal`);
    }
  }
  for (const k of data.keys) {
    if (k.segment < 0 || k.segment >= nSeg) errors.push(`key ${k.color}: segment out of range`);
  }
  return errors;
}
