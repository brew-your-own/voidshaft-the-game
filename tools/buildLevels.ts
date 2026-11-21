import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeLevel, type LevelSummary } from '../src/level/levelIndex';
import { LEVEL_SOURCES } from '../src/level/levels';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'levels');
mkdirSync(outDir, { recursive: true });
const index: LevelSummary[] = [];
for (const [id, build] of Object.entries(LEVEL_SOURCES)) {
  const data = build();
  index.push(summarizeLevel(id, data));
  const file = join(outDir, `${id}.json`);
  writeFileSync(file, `${JSON.stringify(data)}\n`);
  console.log(`${id}: ${data.segments.length} segments, ${data.doors.length} doors, ${data.keys.length} keys, ${data.pickups.length} pickups, ${data.targets.length} targets, ${data.robots.length} robots → ${file}`);
}
// The title screen lists levels from this file, in this order.
writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`index: ${index.length} level(s)`);
