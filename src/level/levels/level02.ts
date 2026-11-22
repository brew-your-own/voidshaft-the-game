import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { GridLayout } from '../GridLayout';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';
import { exitTunnel, lights, pickups, reactorChamber, robots } from './parts';

const { amber, orange, red, rose, white } = PALETTE;

/**
 * Cinder Lanes: a small foundry. A loop of lanes around the start bay, a
 * blue key off the west lane, the gold key in the foundry loft (blue door,
 * east), the red key in the north furnace ring (gold door), and the reactor
 * beyond the red door. The exit is south of the start bay.
 */
export function buildLevel02(): LevelData {
  const b = new LevelBuilder();
  const g = new GridLayout(b, {
    size: [8, 6, 8], warp: 1, seed: 2,
    legend: {
      s: amber, a: amber, b: amber, B: amber,
      1: orange, g: orange, G: orange, f: red,
      2: rose, r: rose, q: red, R: red,
      3: red, c: red, X: red, x: white,
    },
  });
  g.floor(0, [
    '......qqrr....',
    '.Xccc3Rq.r....',
    '......r..r....',
    '......rrrr....',
    '......2....ff.',
    '...aaaa1gggff.',
    '...a..a.......',
    'Bbba..a.......',
    '...a..ss......',
    '...aaass......',
    '......x.......',
  ]);
  g.floor(1, [
    '..............',
    '..............',
    '...........G..',
    '...........g..',
    '...........ff.',
    '...........ff.',
  ]);
  g.build();
  b.theme({ fog: 0x120604, ambient: 0x4a3424 });

  g.door('1', 'g', 'blue');
  g.door('2', 'r', 'gold');
  g.door('3', 'c', 'red');
  b.key(g.one('B'), 'blue');
  b.key(g.one('G'), 'gold');
  b.key(g.one('R'), 'red');
  reactorChamber(b, g.one('X'), SIDE.LEFT, red, 50);
  exitTunnel(b, g.one('x'), SIDE.FRONT);

  lights(b, g, [
    [amber, 7, 8, 0, 50], [amber, 3, 5], [amber, 3, 9], [amber, 1, 7],
    [orange, 9, 5], [red, 12, 5, 0, 55], [orange, 11, 3, 1],
    [rose, 6, 3], [rose, 9, 2], [red, 7, 0, 0, 50], [red, 3, 1],
  ]);
  robots(b, g, [
    ['stinger', 4, 5], ['stinger', 3, 8], ['stinger', 1, 7], ['fuse', 6, 6],
    ['stinger', 9, 5], ['fuse', 10, 5], ['bulwark', 12, 5], ['stinger', 11, 4], ['stinger', 11, 5, 1],
    ['stinger', 8, 3], ['fuse', 6, 2], ['stinger', 9, 1], ['bulwark', 7, 1], ['stinger', 7, 0],
    ['bulwark', 3, 1],
  ]);
  pickups(b, g, [
    ['energy', 5, 9], ['energy', 3, 6], ['shield', 0, 7, 0, [0, -1.5, 0]],
    ['missiles', 11, 3, 1], ['shield', 12, 4],
    ['energy', 9, 2], ['missiles', 6, 0], ['shield', 2, 1],
  ]);

  return b.build('Level 02 — Cinder Lanes', g.at(6, 9), [0, 0, -1]);
}
