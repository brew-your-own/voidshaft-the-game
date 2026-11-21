import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVEL_SOURCES } from '../src/level/levels';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'levels');
mkdirSync(outDir, { recursive: true });
for (const [id, build] of Object.entries(LEVEL_SOURCES)) {
  const data = build();
  const file = join(outDir, `${id}.json`);
  writeFileSync(file, `${JSON.stringify(data)}\n`);
  console.log(`${id}: ${data.segments.length} segments, ${data.doors.length} doors, ${data.keys.length} keys, ${data.pickups.length} pickups, ${data.targets.length} targets → ${file}`);
}
