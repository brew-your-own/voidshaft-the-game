import type { LevelData } from './types';

/** One row of `public/levels/index.json`, written by `npm run levels`. */
export interface LevelSummary {
  id: string;
  name: string;
  segments: number;
  robots: number;
  keys: number;
  doors: number;
}

export function summarizeLevel(id: string, data: LevelData): LevelSummary {
  return {
    id,
    name: data.name,
    segments: data.segments.length,
    robots: data.robots.length,
    keys: data.keys.length,
    doors: data.doors.length,
  };
}

/** Local storage key for the last level the player picked. */
export const LEVEL_STORAGE_KEY = 'voidshaft.level';

/**
 * Which level to load: the `?level=` parameter if given, else the last one
 * picked if it still exists, else the first in the index.
 */
export function chooseLevel(param: string | null, stored: string | null, index: readonly LevelSummary[]): string {
  if (param) return param;
  if (stored && index.some((l) => l.id === stored)) return stored;
  return index[0]?.id ?? 'level01';
}

/** Parses index.json, dropping malformed rows. */
export function parseLevelIndex(raw: unknown): LevelSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is LevelSummary =>
    !!r && typeof r === 'object'
    && typeof (r as LevelSummary).id === 'string' && typeof (r as LevelSummary).name === 'string'
    && ['segments', 'robots', 'keys', 'doors'].every((k) => typeof (r as unknown as Record<string, unknown>)[k] === 'number'));
}
