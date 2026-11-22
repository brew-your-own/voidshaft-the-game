import { describe, expect, it } from 'vitest';
import { BESTIARY } from '../src/entities/robots/bestiary';
import { ROBOT_TYPES } from '../src/level/types';

describe('bestiary', () => {
  it('has one entry per robot type, each with lore and a weapon', () => {
    expect(BESTIARY.map((b) => b.type)).toEqual([...ROBOT_TYPES]);
    for (const b of BESTIARY) {
      expect(b.description.length).toBeGreaterThan(20);
      expect(b.tactics.length).toBeGreaterThan(20);
      expect(b.stats.some(([k]) => k === 'Weapon')).toBe(true);
    }
  });

  it('reads its figures from the tuning', () => {
    const fuse = BESTIARY.find((b) => b.type === 'fuse')!;
    expect(fuse.stats).toContainEqual(['Weapon', 'detonates for 35 dmg within 5 m']);
    expect(fuse.stats).toContainEqual(['Sight', '35 m, all round']);
  });
});
