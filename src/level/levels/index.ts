import type { LevelData } from '../types';
import { buildLevel01 } from './level01';

/** Authoring sources for every level; `npm run levels` exports them to JSON. */
export const LEVEL_SOURCES: Record<string, () => LevelData> = {
  level01: buildLevel01,
};
