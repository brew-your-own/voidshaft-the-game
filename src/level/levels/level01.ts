import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const { cyan, magenta, amber, lime, violet, red } = PALETTE;

/**
 * Test mine. Route: hangar → crawlspace (red key) → corridor → duct →
 * red door → shaft → hub → vault (gold key) → gold door → west wing.
 */
export function buildLevel01(): LevelData {
  const b = new LevelBuilder();

  // Hangar where the player starts.
  const hangar = b.addBox([0, 0, 0], [12, 8, 12], cyan);
  b.addLight(hangar, cyan, 60, 30);

  // Main corridor heading +z, narrowing then ramping up.
  let s = b.extrude(hangar, SIDE.FRONT, { length: 6, scale: 0.6, color: magenta });
  s = b.tunnel(s, SIDE.FRONT, [{ length: 10 }, { length: 8, shift: [0, 4, 0] }, { length: 6 }]);
  b.addLight(s, magenta, 30, 25);

  // Right turn into an amber service duct that snakes a little.
  const ductStart = b.extrude(s, SIDE.RIGHT, { length: 8, color: amber });
  b.door(s, SIDE.RIGHT);
  const duct = b.tunnel(ductStart, SIDE.RIGHT, [
    { length: 8, shift: [0, 0, 3] },
    { length: 8, shift: [0, 0, -3] },
    { length: 6 },
  ]);
  b.addLight(duct, amber, 30, 25);

  // Vertical shaft, behind a red door.
  let shaft = b.extrude(duct, SIDE.TOP, { length: 8, color: lime });
  b.door(duct, SIDE.TOP, 'red');
  shaft = b.tunnel(shaft, SIDE.TOP, [{ length: 10, scale: 1.1 }, { length: 10 }]);
  b.addLight(shaft, lime, 30, 25);

  // Hub chamber: flare out, big room, narrow back down.
  const flare = b.extrude(shaft, SIDE.TOP, { length: 4, scale: 2.4, color: violet });
  const hub = b.extrude(flare, SIDE.TOP, { length: 14 });
  const cap = b.extrude(hub, SIDE.TOP, { length: 4, scale: 0.45 });
  b.addLight(hub, violet, 90, 40);
  b.addLight(cap, cyan, 20, 15);

  // Branches out of the hub.
  // Doors go on the narrow necks, not on the room walls.
  const westNeck = b.extrude(hub, SIDE.LEFT, { length: 6, scale: 0.4, color: red });
  const west = b.tunnel(westNeck, SIDE.LEFT, [{ length: 10, shift: [0, -3, 0] }, { length: 10 }]);
  b.door(westNeck, SIDE.LEFT, 'gold');
  b.addLight(west, red, 30, 25);
  const vault = b.tunnel(hub, SIDE.BACK, [
    { length: 6, scale: 0.35, color: cyan },
    { length: 12, scale: 0.8 },
    { length: 8, shift: [4, 0, 0] },
  ]);
  b.key(vault, 'gold');

  // Side tunnel from the hangar: low, twisting crawlspace.
  const crawlNeck = b.extrude(hangar, SIDE.LEFT, { length: 6, scale: 0.5, color: amber });
  const crawl = b.tunnel(crawlNeck, SIDE.LEFT, [
    { length: 8, shift: [0, 0, 4] },
    { length: 8, shift: [0, -2, -4] },
    { length: 8, scale: 1.4 },
  ]);
  b.door(crawlNeck, SIDE.LEFT);
  b.addLight(crawl, amber, 25, 20);
  b.key(crawl, 'red');

  // Small alcove behind the start.
  b.extrude(hangar, SIDE.BACK, { length: 5, scale: 0.7, color: violet });

  return b.build('Level 01 — Test Mine', hangar, [0, 0, 1]);
}
