import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { GridLayout } from '../GridLayout';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { exitTunnel, lights, pickups, reactorChamber, robots } from './parts';

const { ice, white, cyan, blue, orange, gold, rose, red } = PALETTE;

/**
 * Null Spire: the deep core, built round a three-floor atrium. South: the
 * start bay and its loop, with a mezzanine loop and a balcony above. West:
 * the blue wing, looped. East, behind the blue door: the generator hall and
 * its loop, the gold key up a spur, and the exit. North, on floor 1 behind
 * the gold door: the red key's archive with two loops. The red door is on
 * the atrium's top floor, west, and leads to the reactor; the escape runs
 * back down through the atrium to the east exit.
 */
export function buildLevel06(): LevelData {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: 1.3, seed: 6,
    legend: {
      s: ice, a: ice, h: ice, m: blue, n: blue,
      w: cyan, b: blue, B: blue,
      1: orange, g: orange, f: orange, e: gold, G: gold, x: white,
      2: rose, r: rose, q: rose, R: rose,
      3: red, c: red, X: red,
    },
    // Upper loops run over lower corridors without opening into them.
    separate: ['am', 'mn'],
  });
  g.floor(0, [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '........hhh...ff..',
    '.wwww.aahhh1ggff..',
    '.w..w.a.hhh.g..g..',
    '.bb.w.a..a..g..gx.',
    '.Bbbbba..a..gggg..',
    '......a..a........',
    '......a..a........',
    '......asss........',
    '........ss........',
  ]);
  g.floor(1, [
    '..................',
    '......rrqqqrr.....',
    '......r.qRq.r.....',
    '......rrrrrrr.....',
    '.........r....G...',
    '.........r....e...',
    '.........2....e...',
    '........hhh...ff..',
    '........hhh...ff..',
    '.......mhhh.......',
    '.......m.m........',
    '.......m.m........',
    '.......mmm........',
    '..................',
    '........ss........',
    '........ss........',
  ]);
  g.floor(2, [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '........hhh.......',
    '..Xcccc3hhh.......',
    '........hhh.......',
    '........n.n.......',
    '........nnn.......',
  ]);
  g.build();
  b.theme({ fog: 0x0a0a10, ambient: 0x384458 });

  g.door('1', 'g', 'blue');
  g.door('2', 'r', 'gold');
  g.door('3', 'c', 'red');
  b.key(g.one('B'), 'blue');
  b.key(g.one('G'), 'gold');
  b.key(g.one('R'), 'red');
  reactorChamber(b, g.one('X'), SIDE.LEFT, red, 75);
  exitTunnel(b, g.one('x'), SIDE.RIGHT);

  lights(b, g, [
    [ice, 9, 14, 0, 25], [ice, 6, 11, 0, 20], [ice, 9, 11, 0, 20],
    [ice, 9, 8, 0, 25], [white, 9, 8, 1, 20], [ice, 9, 8, 2, 25], [blue, 7, 11, 1], [blue, 9, 11, 2],
    [blue, 2, 11, 0, 45], [cyan, 2, 8], [cyan, 4, 10],
    [orange, 13, 8], [orange, 15, 8, 1, 55], [orange, 15, 10], [orange, 13, 11], [gold, 14, 5, 1],
    [rose, 9, 4, 1], [rose, 9, 2, 1, 55], [rose, 6, 2, 1], [rose, 12, 2, 1],
    [red, 5, 8, 2], [red, 3, 8, 2],
  ]);
  robots(b, g, [
    ['stinger', 9, 12], ['stinger', 6, 12], ['stinger', 6, 9], ['fuse', 7, 14], ['fuse', 9, 10],
    ['bulwark', 9, 8], ['bulwark', 9, 8, 2], ['stinger', 8, 7, 1], ['stinger', 10, 9, 1], ['stinger', 10, 7],
    ['stinger', 8, 9, 2],
    ['stinger', 7, 11, 1], ['stinger', 9, 12, 1], ['fuse', 8, 12, 1],
    ['stinger', 9, 11, 2], ['fuse', 10, 10, 2],
    ['stinger', 2, 8], ['stinger', 4, 9], ['stinger', 4, 11], ['bulwark', 1, 10], ['fuse', 1, 8],
    ['stinger', 12, 8], ['stinger', 15, 10], ['stinger', 13, 11], ['bulwark', 14, 8], ['bulwark', 15, 7, 1],
    ['fuse', 12, 10], ['fuse', 15, 9],
    ['stinger', 14, 5, 1],
    ['stinger', 9, 4, 1], ['stinger', 6, 2, 1], ['stinger', 12, 2, 1], ['stinger', 11, 3, 1], ['stinger', 7, 3, 1],
    ['bulwark', 9, 1, 1], ['bulwark', 8, 2, 1], ['fuse', 6, 3, 1], ['fuse', 12, 1, 1],
    ['bulwark', 4, 8, 2], ['fuse', 5, 8, 2], ['stinger', 3, 8, 2],
  ]);
  pickups(b, g, [
    ['energy', 6, 13], ['energy', 9, 11], ['shield', 8, 15], ['missiles', 8, 8, 1], ['shield', 2, 11],
    ['energy', 3, 8], ['missiles', 4, 10], ['shield', 13, 8], ['energy', 15, 11], ['missiles', 14, 7, 1],
    ['shield', 14, 6, 1], ['energy', 9, 5, 1], ['missiles', 6, 1, 1], ['shield', 12, 3, 1], ['energy', 10, 1, 1],
    ['shield', 6, 8, 2], ['missiles', 10, 11, 2], ['energy', 7, 10, 1],
  ]);

  return b.build('Level 06 — Null Spire', g.at(9, 14), [0, 0, -1]);
}
