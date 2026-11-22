import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { GridLayout } from '../GridLayout';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { exitTunnel, lights, pickups, reactorChamber, robots } from './parts';

const { violet, magenta, rose, cyan, red } = PALETTE;

/**
 * Choir of Wires: a relay cathedral. The nave is a ring with a gallery
 * above its north side, a blue chapel to the west and a second loop to the
 * east that leads to the exit. The blue door opens the two-floor choir hall,
 * looped round its east side, with the gold key in a loft off its upper
 * floor. The gold door leads to the cyan cloister and the red key; the red
 * door at its north end, to the reactor.
 */
export function buildLevel05(): LevelData {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: 1.3, seed: 5,
    legend: {
      s: violet, a: violet, b: magenta, B: magenta, Y: rose, y: rose, x: PALETTE.white,
      1: magenta, g: magenta, h: rose, e: magenta, G: magenta,
      2: cyan, r: cyan, q: cyan, R: cyan, 3: red,
    },
    // The gallery runs over the nave and only opens into it at its ends (`Y`).
    separate: ['ay'],
  });
  g.floor(0, [
    '...3...........',
    '..rrr..hhhh....',
    '..r.r..hhhhggg.',
    '..rrrr2hhhh..g.',
    '.qq.....g.g..g.',
    '.qR.....1.g..g.',
    '...aaaaaa.gggg.',
    '...a....a......',
    'Bbba....aaaaa..',
    '...a....a...a..',
    '.aaaaaaaa...ax.',
    '.ss.....aaaaa..',
    '.ss............',
  ]);
  g.floor(1, [
    '.....G.........',
    '.....eehhhh....',
    '.......hhhh....',
    '.......hhhh....',
    '...............',
    '...............',
    '...YyyyyY......',
    '...............',
    '...............',
    '...............',
    '...............',
    '.ss............',
    '.ss............',
  ]);
  g.build();
  b.theme({ fog: 0x0c0414, ambient: 0x3c3058 });

  g.door('1', 'g', 'blue');
  g.door('2', 'r', 'gold');
  g.door('3', 'r', 'red');
  b.key(g.one('B'), 'blue');
  b.key(g.one('G'), 'gold');
  b.key(g.one('R'), 'red');
  reactorChamber(b, g.one('3'), SIDE.BACK, red, 70);
  exitTunnel(b, g.one('x'), SIDE.RIGHT);

  lights(b, g, [
    [violet, 2, 11, 0, 50], [violet, 5, 10], [violet, 8, 7], [violet, 3, 8], [magenta, 1, 8],
    [violet, 10, 8], [violet, 12, 10], [rose, 6, 6, 1],
    [magenta, 8, 4], [rose, 8, 2, 0, 60], [rose, 9, 2, 1, 60], [magenta, 13, 2], [magenta, 13, 6], [magenta, 10, 5],
    [magenta, 6, 1, 1], [cyan, 2, 2], [cyan, 1, 4, 0, 45], [cyan, 4, 3],
  ]);
  robots(b, g, [
    ['stinger', 5, 10], ['stinger', 8, 8], ['stinger', 3, 7], ['stinger', 6, 6], ['fuse', 1, 10], ['fuse', 8, 10],
    ['bulwark', 3, 10], ['stinger', 1, 8],
    ['stinger', 10, 8], ['stinger', 12, 10], ['stinger', 10, 11], ['fuse', 12, 8], ['bulwark', 12, 11],
    ['stinger', 5, 6, 1], ['stinger', 7, 6, 1],
    ['bulwark', 8, 2], ['bulwark', 9, 2, 1], ['stinger', 7, 1, 1], ['stinger', 10, 3, 1], ['stinger', 9, 1],
    ['stinger', 10, 2],
    ['stinger', 12, 2], ['stinger', 13, 5], ['stinger', 11, 6], ['fuse', 13, 3], ['fuse', 10, 5],
    ['stinger', 6, 1, 1],
    ['stinger', 4, 2], ['stinger', 2, 1], ['stinger', 3, 3], ['bulwark', 1, 4], ['fuse', 4, 1], ['fuse', 2, 2],
  ]);
  pickups(b, g, [
    ['energy', 4, 10], ['energy', 8, 9], ['shield', 0, 8, 0, [0, -1.5, 0]], ['missiles', 12, 9], ['shield', 11, 11],
    ['energy', 6, 6, 1], ['missiles', 8, 4], ['shield', 13, 4], ['energy', 11, 2], ['missiles', 7, 3, 1],
    ['shield', 5, 1, 1], ['energy', 3, 1], ['missiles', 2, 3], ['shield', 2, 5, 0, [0, -1.5, 0]],
  ]);

  return b.build('Level 05 — Choir of Wires', g.at(2, 11), [0, 0, -1]);
}
