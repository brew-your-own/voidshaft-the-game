import type { LevelData } from '../types';
import { buildLevel01 } from './level01';
import { buildLevel02 } from './level02';
import { buildLevel03 } from './level03';
import { buildLevel04 } from './level04';
import { buildLevel05 } from './level05';
import { buildLevel06 } from './level06';

/**
 * Authoring sources for every level; `npm run levels` exports them to JSON.
 * The order is the order on the title screen.
 */
export const LEVEL_SOURCES: Record<string, () => LevelData> = {
  level01: buildLevel01,
  level02: buildLevel02,
  level03: buildLevel03,
  level04: buildLevel04,
  level05: buildLevel05,
  level06: buildLevel06,
};
