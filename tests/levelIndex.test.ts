import { describe, expect, it } from 'vitest';
import { chooseLevel, parseLevelIndex, summarizeLevel, type LevelSummary } from '../src/level/levelIndex';
import { LEVEL_SOURCES } from '../src/level/levels';

const row = (id: string): LevelSummary => ({ id, name: id, segments: 1, robots: 0, keys: 0, doors: 0 });

describe('level index', () => {
  it('summarizes every level source', () => {
    for (const [id, build] of Object.entries(LEVEL_SOURCES)) {
      const data = build();
      const s = summarizeLevel(id, data);
      expect(s).toEqual({
        id, name: data.name, segments: data.segments.length, robots: data.robots.length,
        keys: data.keys.length, doors: data.doors.length,
      });
    }
  });

  it('prefers the URL, then the stored choice, then the first level', () => {
    const index = [row('a'), row('b')];
    expect(chooseLevel('b', 'a', index)).toBe('b');
    expect(chooseLevel('zzz', null, index)).toBe('zzz'); // explicit URLs are trusted; loading reports errors
    expect(chooseLevel(null, 'b', index)).toBe('b');
    expect(chooseLevel(null, 'gone', index)).toBe('a');
    expect(chooseLevel(null, null, [])).toBe('level01');
  });

  it('drops malformed rows', () => {
    expect(parseLevelIndex(null)).toEqual([]);
    expect(parseLevelIndex({ id: 'a' })).toEqual([]);
    expect(parseLevelIndex([row('a'), { id: 'b' }, 7, null])).toEqual([row('a')]);
  });
});
