# VOIDSHAFT

An original browser-based 6DOF tunnel shooter inspired by Descent (1995), built with Three.js, Vite and TypeScript. Never use Descent's names, levels or assets.

## Where we are

Milestones 1–12 are done: six levels, `level01` plus five bigger grid-built ones. Next is hand playtesting and tuning. Gamepad support is out of scope. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan, what each milestone delivered and the known gaps. **Update ROADMAP.md (status table, "Next", known gaps) whenever a milestone lands.**

## Commands

```bash
npm run dev        # Vite dev server
npm test           # Vitest (headless, no WebGL needed)
npm run typecheck
npm run levels     # export src/level/levels/*.ts → public/levels/*.json
npm run build      # levels + typecheck + vite build
```

`vite.config.ts` injects `git describe` as `__APP_VERSION__` (shown on the title screen) and reads the `BASE_PATH` env var as Vite's `base` (the Pages workflow sets it to `/<repo>/`). Releases: push a `v*` tag.

After editing a level source, run `npm run levels`: the game loads the exported JSON, not the TS source. New levels go in `LEVEL_SOURCES` (`src/level/levels/index.ts`); its order is the order on the title screen. Check a level's layout with its MAP button.

Levels 02–06 are `GridLayout` maps: one string array per floor, one character per cell, colours from the legend; robots, pickups and lights are placed by `[column, row, floor]` through `levels/parts.ts`. `tests/levels.test.ts` checks every level for solvability (blue → gold → red → reactor → exit), overlaps, flat faces and wall clearance, so run `npm test` after a layout change.

## Layout

| Path | What lives there |
|---|---|
| `src/game/` | `Game` (main loop with a fixed 120 Hz step, wiring), `Player`, `Objective` (mission state machine), `Settings` (stored settings, key bindings) |
| `src/level/` | Segment data types, `LevelBuilder` (extrusion-based authoring), `GridLayout` (ASCII-map authoring on a sheared lattice), `progression` (solvability check), `Level` (segment lookup, line of sight, BFS `findPath`, nearby walls and doors), loader and validation, level index (`levelIndex`: summaries, which level to load), mesh builder, automap lines and seen-segment memory, level sources |
| `src/physics/` | `Ship` (6DOF body), `Collision` (sphere against wall triangles, with sliding) |
| `src/combat/` | `ProjectileSystem` (swept hits, homing, `explode` splash damage), player weapons, raycasts, the `Effects` interface |
| `src/entities/` | `Door`, `Pickup`, `Target`, `Reactor` (the boss), `robots/` (`Robot` AI, tuning, models in `RobotMeshes`, shape helpers and merging in `meshKit`, design `proposals`, enemy-screen text in `bestiary`) |
| `src/fx/` | Particles, a fixed `LightPool` for flashes, `StaticLights` (12 slots showing the level lights nearest the camera, with an alarm override), `GameEffects` (explosions with pooled `Shockwaves` and bouncing `Debris`), `CameraShake` (trauma model, view-only), `EscapeSequence` (red strobe, klaxon, sparks, exit guide and rumble after the reactor dies) |
| `src/audio/` | `AudioEngine`: all sounds synthesised with WebAudio, through a bass shelf and reverb (`AUDIO_TUNING`); `variants` holds alternative recipes for the sound lab |
| `src/render/` | Renderer and bloom (with resolution scaling), `HitFlashPass` (damage vignette and colour fringe), adaptive `ResolutionGovernor`, palette, materials, `WallDetail` (procedural plate seams, rivets, vents, glowing seams and hazard stripes on walls, fed by attributes from `level/wallPanels.ts`), portal culler, `AutomapView`, `NeonEnvironment` (reflection map for robot hulls) |
| `src/shipyard/`, `shipyard.html` | Dev-only turntable page for robot models and proposals |
| `src/soundlab/`, `soundlab.html` | Dev-only page to audition sound variants and tune bass and reverb |
| `src/ui/` | `HUD` (DOM overlay, end screen), `Menu` (title screen with the level list, pause, settings, controls), `MapViewer` (whole-level map from the title screen), `EnemyViewer` (robot turntable and stats from the title screen) |
| `src/input/` | Keyboard through the player's bindings, pointer-locked mouse |
| `tests/` | Vitest suites per area |
| `tools/buildLevels.ts` | Level JSON exporter |
| `.github/workflows/pages.yml` | Tests, builds and publishes to GitHub Pages when a `v*` tag is pushed |

## Conventions

- **Git:**
  - Commit directly to `main` (renamed from `master`; it tracks `origin/main`); do not create branches in this project.
  - Commits are signed (personal identity); check that `git log -1 --show-signature` shows "Good signature".
  - Commit only when asked.
- **Headless logic:** game logic takes `Effects` / `SoundSink` interfaces so tests can pass `NO_EFFECTS` / `NO_SOUND`. Keep new gameplay code testable in the same way: no DOM or WebGL in logic classes.
- **Level geometry:**
  - Sides are numbered LEFT 0, RIGHT 1, BOTTOM 2, TOP 3, BACK 4, FRONT 5; `children[side] = -1` means a wall.
  - Wall normals point into the segment.
  - Put doors on narrow necks, not room walls. Call `door()` / `exit()` after the `extrude` that creates the portal.
- **Lights:** the number of lights must stay constant at runtime, or every material recompiles. Use `LightPool` flashes rather than adding or removing lights.
- **Performance:** the game is limited per pixel (lights and bloom), not by draw calls. New materials get compiled by `Game.warmUp()` only if their object is in the scene at load; otherwise they stall the first frame they appear in.
- **Tuning:** gameplay numbers live in `*_TUNING` constants next to their code (`SHIP_TUNING`, `WEAPON_TUNING`, `ROBOT_TUNING`, `REACTOR_TUNING`, …).
- **Robot models:** build from `meshKit` parts, face −Z, stay near the collision radius; `buildRobotMesh` merges them by material, so share material instances. Review new designs on `/shipyard.html`.
- **Look:** untextured flat shading, a cyberpunk palette (`src/render/palette.ts`), emissive LEDs with `toneMapped: false`.

## Verifying in the browser

- The dev server config is in `.claude/launch.json`. Port 5173 is often taken by another local project, so Vite falls back to 5174.
- The built-in browser pane can't capture the mouse and you can't hear audio there. Drive the game through the dev hooks on `window.game` instead: `debugFly(seconds, controls)`, `debugGiveKey`, `debugShip`, `debugPlayer`, `debugRobots`, `debugReactor`, `debugObjective`, `debugEscape()` (destroys the reactor and starts the escape), `debugEscapeSequence`.
- Particles and simulation only advance while the mouse is captured, or inside `debugFly`.
- The menu overlay covers the canvas; hide it before taking screenshots.
