import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** `git describe` of the build, shown on the title screen. */
function gitDescribe(): string {
  try {
    return execSync('git describe --tags --always --dirty', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  // GitHub Pages serves the game from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(gitDescribe()) },
  build: {
    rolldownOptions: {
      output: {
        // Three.js changes far less often than the game, so it gets its own
        // cacheable chunks (split in two to stay under the 500 kB warning).
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /three[\\/]build[\\/]three\.core/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
