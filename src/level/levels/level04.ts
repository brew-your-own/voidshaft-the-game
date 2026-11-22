import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { GridLayout } from '../GridLayout';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { exitTunnel, lights, pickups, reactorChamber, robots } from './parts';

const { lime, acid, teal, amber, red } = PALETTE;

/**
 * Verdant Stacks: hydroponic towers on four floors around one open shaft,
 * the stack. The ground floor has two loops (lanes and a root cellar) and
 * the blue key. Floor 1: blue door into the garden, with the gold key and a
 * walkway above its loop. Floor 2: gold door to the red key's seed vault.
 * Floor 3: red door to the reactor, and the exit at the top of the stack.
 */
export function buildLevel04(): LevelData {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: 1.2, seed: 4,
    legend: {
      s: lime, a: lime, b: acid, B: acid, k: teal, t: teal,
      1: acid, g: acid, f: lime, G: acid, w: acid, v: acid,
      2: amber, r: amber, q: amber, R: amber,
      3: red, c: red, X: red, x: PALETTE.white,
    },
    // Ground-floor cells under the garden loop, and the walkway over it,
    // stay closed off from it; the walkway opens at its two ends (`w`).
    separate: ['ag', 'kg', 'gv'],
  });
  g.floor(0, [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '...aaatt......',
    '...a..tt......',
    '.bba..a.......',
    '.B.a..a.aakk..',
    '...aaassa.kk..',
    '......ssaaa...',
  ]);
  g.floor(1, [
    '..............',
    '..............',
    '..............',
    '..............',
    '............fG',
    '......tt1gggff',
    '......tt.g..ff',
    '.........g..g.',
    '.........gggg.',
  ]);
  g.floor(2, [
    '...rrqR.......',
    '...r.qq.......',
    '...r..r.......',
    '...rrrr.......',
    '......2.......',
    '......tt.w....',
    '......tt.v....',
    '.........v....',
    '.........w....',
  ]);
  g.floor(3, [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '......ttx.....',
    'Xcccc3tt......',
  ]);
  g.build();
  b.theme({ fog: 0x041208, ambient: 0x34482c });

  g.door('1', 'g', 'blue');
  g.door('2', 'r', 'gold');
  g.door('3', 'c', 'red');
  b.key(g.one('B'), 'blue');
  b.key(g.one('G'), 'gold');
  b.key(g.one('R'), 'red');
  reactorChamber(b, g.one('X'), SIDE.LEFT, red, 60);
  exitTunnel(b, g.one('x'), SIDE.RIGHT);

  lights(b, g, [
    [lime, 7, 10, 0, 50], [lime, 4, 5], [lime, 3, 9], [acid, 1, 7], [teal, 10, 9],
    [teal, 6, 5, 0, 45], [teal, 7, 6, 2, 45], [teal, 6, 6, 3, 45],
    [acid, 10, 5, 1], [lime, 12, 5, 1, 55], [acid, 10, 8, 1], [acid, 9, 7, 2],
    [amber, 6, 3, 2], [amber, 5, 0, 2, 50], [amber, 3, 2, 2], [red, 2, 6, 3],
  ]);
  robots(b, g, [
    ['stinger', 4, 5], ['stinger', 3, 8], ['stinger', 6, 7], ['stinger', 9, 10], ['fuse', 3, 6], ['fuse', 8, 8],
    ['bulwark', 10, 8], ['stinger', 11, 9], ['stinger', 1, 7],
    ['stinger', 6, 5, 1], ['stinger', 7, 6, 2], ['fuse', 7, 5, 3], ['bulwark', 6, 6],
    ['stinger', 10, 5, 1], ['stinger', 12, 8, 1], ['stinger', 9, 7, 1], ['bulwark', 12, 5, 1],
    ['fuse', 13, 6, 1], ['fuse', 11, 8, 1],
    ['stinger', 9, 6, 2],
    ['stinger', 6, 3, 2], ['stinger', 3, 1, 2], ['stinger', 4, 3, 2], ['bulwark', 5, 1, 2], ['fuse', 3, 3, 2],
    ['bulwark', 2, 6, 3], ['fuse', 3, 6, 3],
  ]);
  pickups(b, g, [
    ['energy', 5, 9], ['energy', 9, 10], ['shield', 1, 8, 0, [0, -1.5, 0]], ['missiles', 11, 8],
    ['shield', 6, 6, 1], ['energy', 11, 5, 1], ['missiles', 12, 4, 1], ['shield', 9, 7, 2],
    ['energy', 6, 2, 2], ['missiles', 4, 0, 2], ['shield', 1, 6, 3], ['energy', 7, 6, 3],
  ]);

  return b.build('Level 04 — Verdant Stacks', g.at(6, 10), [0, 0, -1]);
}
