import { PALETTE } from '../../render/palette';
import { SIDE } from '../geometry';
import { LevelBuilder } from '../LevelBuilder';
import type { LevelData } from '../types';

const { cyan, magenta, amber, lime, violet, red } = PALETTE;

/**
 * Test mine. Route: hangar → crawlspace (red key) → corridor → duct →
 * red door → shaft → hub → vault (gold key) → gold door → west wing →
 * reactor. Destroying the reactor unseals the exit above the hub.
 */
export function buildLevel01(): LevelData {
  const b = new LevelBuilder();

  // Hangar where the player starts.
  const hangar = b.addBox([0, 0, 0], [12, 8, 12], cyan);
  b.addLight(hangar, cyan, 60, 30);
  // Firing range: practice targets at the far end of the hangar.
  b.target(hangar, [-3, 1, 4]);
  b.target(hangar, [3, -1, 4]);

  // Main corridor heading +z, narrowing then ramping up.
  let s = b.extrude(hangar, SIDE.FRONT, { length: 6, scale: 0.6, color: magenta });
  s = b.tunnel(s, SIDE.FRONT, [{ length: 10 }, { length: 8, shift: [0, 4, 0] }, { length: 6 }]);
  b.addLight(s, magenta, 30, 25);
  b.robot(s, 'stinger');

  // Right turn into an amber service duct that snakes a little.
  const ductStart = b.extrude(s, SIDE.RIGHT, { length: 8, color: amber });
  b.door(s, SIDE.RIGHT);
  const duct = b.tunnel(ductStart, SIDE.RIGHT, [
    { length: 8, shift: [0, 0, 3] },
    { length: 8, shift: [0, 0, -3] },
    { length: 6 },
  ]);
  b.addLight(duct, amber, 30, 25);
  b.pickup(duct, 'energy');
  b.robot(ductStart, 'fuse');
  b.robot(duct, 'stinger', [0, 0, 1]);

  // Vertical shaft, behind a red door.
  let shaft = b.extrude(duct, SIDE.TOP, { length: 8, color: lime });
  b.door(duct, SIDE.TOP, 'red');
  shaft = b.tunnel(shaft, SIDE.TOP, [{ length: 10, scale: 1.1 }, { length: 10 }]);
  b.addLight(shaft, lime, 30, 25);
  b.robot(shaft, 'fuse');

  // Hub chamber: flare out, big room, narrow back down.
  const flare = b.extrude(shaft, SIDE.TOP, { length: 4, scale: 2.4, color: violet });
  const hub = b.extrude(flare, SIDE.TOP, { length: 14 });
  const cap = b.extrude(hub, SIDE.TOP, { length: 4, scale: 0.45 });
  b.addLight(hub, violet, 90, 40);
  b.addLight(cap, cyan, 20, 15);
  b.robot(hub, 'bulwark', [0, 2, 0]);
  b.robot(hub, 'stinger', [-5, 3, 2]);
  b.robot(hub, 'stinger', [5, -2, -3]);
  b.pickup(hub, 'shield', [0, -5, 0]);
  b.pickup(cap, 'missiles');

  // Exit above the hub: sealed until the reactor blows.
  const exitNeck = b.extrude(cap, SIDE.TOP, { length: 6, color: cyan });
  b.exit(cap, SIDE.TOP);
  const exitTunnel = b.tunnel(exitNeck, SIDE.TOP, [{ length: 10 }, { length: 10, scale: 1.3 }]);
  b.addLight(exitTunnel, PALETTE.white, 60, 30);

  // Branches out of the hub.
  // Doors go on the narrow necks, not on the room walls.
  const westNeck = b.extrude(hub, SIDE.LEFT, { length: 6, scale: 0.4, color: red });
  const west = b.tunnel(westNeck, SIDE.LEFT, [{ length: 10, shift: [0, -3, 0] }, { length: 10 }]);
  b.door(westNeck, SIDE.LEFT, 'gold');
  b.addLight(west, red, 30, 25);
  b.robot(west, 'bulwark');
  b.robot(west, 'fuse', [3, 0, 0]);

  // Reactor chamber at the end of the west wing.
  const reactorFlare = b.extrude(west, SIDE.LEFT, { length: 4, scale: 2.2, color: red });
  const chamber = b.extrude(reactorFlare, SIDE.LEFT, { length: 18 });
  const reactorBack = b.extrude(chamber, SIDE.LEFT, { length: 4, scale: 0.5 });
  b.addLight(chamber, red, 70, 40);
  b.addLight(reactorBack, amber, 20, 15);
  b.reactor(chamber, [0, 0, 0], [[5, 3.5, 0], [-5, -1.75, 3], [0, -2, -4]], 50);
  b.robot(reactorFlare, 'stinger', [0, 3, 0]);
  b.robot(reactorBack, 'stinger');
  b.pickup(reactorFlare, 'shield', [0, -3, 0]);
  b.pickup(reactorFlare, 'missiles', [0, -3, 2]);
  const vault = b.tunnel(hub, SIDE.BACK, [
    { length: 6, scale: 0.35, color: cyan },
    { length: 12, scale: 0.8 },
    { length: 8, shift: [4, 0, 0] },
  ]);
  b.key(vault, 'gold');
  b.robot(vault, 'stinger', [0, 1, 2]);
  b.pickup(vault, 'missiles', [0, 0, -2]);

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
  b.robot(crawl, 'stinger', [0, 1, 0]);
  b.pickup(crawl, 'energy', [0, -1, 2]);
  b.pickup(crawl, 'shield', [0, -1, -2]);

  // Small alcove behind the start.
  b.extrude(hangar, SIDE.BACK, { length: 5, scale: 0.7, color: violet });

  return b.build('Level 01 — Test Mine', hangar, [0, 0, 1]);
}
