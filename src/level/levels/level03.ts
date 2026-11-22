import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { GridLayout } from '../GridLayout';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { exitTunnel, lights, pickups, reactorChamber, robots } from './parts';

const { cyan, ice, teal, blue, violet, magenta } = PALETTE;

/**
 * Glasswater Depot: a coolant depot on three floors. A ring of pipes around
 * the hangar; the blue key up a shaft from the ring. Behind the blue door, a
 * two-floor tank hall with a loop round its east side and a gantry above it
 * that holds the gold key. The gold door leads west to the red key's
 * pump room, and the red door to the reactor. The exit is under the hangar.
 */
export function buildLevel03(): LevelData {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: 1.2, seed: 3,
    legend: {
      s: cyan, a: cyan, p: ice, B: ice,
      1: teal, g: teal, t: blue, u: teal, h: teal, G: teal,
      2: ice, r: ice, q: violet, R: violet,
      3: magenta, c: magenta, X: magenta, x: PALETTE.white,
    },
    // The gantry runs over the tank hall but only opens into it through `u`.
    separate: ['th'],
  });
  g.floor(0, [
    '.rrrr........',
    '.qq.r........',
    '.qRrrrr2tttgg',
    '...r....ttt.g',
    'Xcc3.....gggg',
    '.........1...',
    '..aaaaaaaa...',
    '..a......a...',
    '..a......a...',
    '..ss.....a...',
    '..ssaaaaaa...',
    '..x..........',
  ]);
  g.floor(1, [
    '.............',
    '.............',
    '........ttt..',
    '......B.ttt..',
    '......p......',
    '......p......',
    '......p......',
  ]);
  g.floor(2, [
    '.............',
    '.............',
    '......Ghhu...',
  ]);
  g.build();
  b.theme({ fog: 0x021014, ambient: 0x2a4455 });

  g.door('1', 'g', 'blue');
  g.door('2', 'r', 'gold');
  g.door('3', 'c', 'red');
  b.key(g.one('B'), 'blue');
  b.key(g.one('G'), 'gold');
  b.key(g.one('R'), 'red');
  reactorChamber(b, g.one('X'), SIDE.LEFT, magenta, 55);
  exitTunnel(b, g.one('x'), SIDE.FRONT);

  lights(b, g, [
    [cyan, 3, 10, 0, 50], [cyan, 5, 6], [cyan, 9, 8], [cyan, 2, 7],
    [ice, 6, 5, 1, 20], [ice, 6, 3, 1, 20],
    [teal, 9, 4], [blue, 9, 2, 0, 60], [blue, 9, 3, 1, 50], [teal, 12, 3], [teal, 8, 2, 2],
    [ice, 5, 2, 0, 20], [violet, 1, 1, 0, 45], [violet, 3, 0], [magenta, 1, 4],
  ]);
  robots(b, g, [
    ['stinger', 5, 10], ['stinger', 9, 9], ['stinger', 6, 6], ['stinger', 2, 7], ['fuse', 9, 6], ['fuse', 3, 6],
    ['stinger', 6, 4, 1], ['fuse', 6, 5, 1],
    ['bulwark', 9, 2], ['bulwark', 8, 3, 1], ['stinger', 10, 2, 1], ['stinger', 12, 2], ['stinger', 11, 4],
    ['stinger', 10, 4], ['fuse', 12, 3],
    ['stinger', 8, 2, 2],
    ['stinger', 5, 2], ['stinger', 3, 0], ['fuse', 4, 1], ['bulwark', 1, 1], ['stinger', 2, 1],
    ['bulwark', 1, 4],
  ]);
  pickups(b, g, [
    ['energy', 7, 10], ['energy', 2, 8], ['missiles', 9, 7], ['shield', 6, 4, 1],
    ['energy', 12, 4], ['missiles', 10, 3, 1], ['shield', 8, 3], ['shield', 7, 2, 2],
    ['energy', 4, 0], ['missiles', 1, 2], ['shield', 2, 4],
  ]);

  return b.build('Level 03 — Glasswater Depot', g.at(3, 10), [1, 0, 0]);
}
