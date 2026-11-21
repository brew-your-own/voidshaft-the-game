# VOIDSHAFT

An original browser-based 6DOF tunnel shooter inspired by Descent (1995), built with Three.js, Vite and TypeScript. Never use Descent's names, levels or assets.

## Where we are

Milestones 1–7 of 8 are done; milestone 8 (performance, automap) is next. Gamepad support is out of scope. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan, what each milestone delivered and the known gaps. **Update ROADMAP.md (status table, "Next", known gaps) whenever a milestone lands.**

## Commands

```bash
npm run dev        # Vite dev server
npm test           # Vitest (headless, no WebGL needed)
npm run typecheck
npm run levels     # export src/level/levels/*.ts → public/levels/*.json
npm run build      # levels + typecheck + vite build
```

After editing a level source, run `npm run levels`: the game loads the exported JSON, not the TS source.

## Layout

| Path | What lives there |
|---|---|
| `src/game/` | `Game` (main loop with a fixed 120 Hz step, wiring), `Player`, `Objective` (mission state machine), `Settings` (stored settings, key bindings) |
| `src/level/` | Segment data types, `LevelBuilder` (extrusion-based authoring), `Level` (segment lookup, line of sight, BFS `findPath`, nearby walls and doors), loader and validation, mesh builder, level sources |
| `src/physics/` | `Ship` (6DOF body), `Collision` (sphere against wall triangles, with sliding) |
| `src/combat/` | `ProjectileSystem` (swept hits, homing, `explode` splash damage), player weapons, raycasts, the `Effects` interface |
| `src/entities/` | `Door`, `Pickup`, `Target`, `Reactor` (the boss), `robots/` (`Robot` AI, meshes, tuning) |
| `src/fx/` | Particles, a fixed `LightPool`, `GameEffects` |
| `src/audio/` | `AudioEngine`: all sounds synthesised with WebAudio |
| `src/render/` | Renderer and bloom, palette, materials (where textures will plug in later), portal culler |
| `src/ui/` | `HUD` (DOM overlay, end screen), `Menu` (main, pause, settings, controls) |
| `src/input/` | Keyboard through the player's bindings, pointer-locked mouse |
| `tests/` | Vitest suites per area |
| `tools/buildLevels.ts` | Level JSON exporter |

## Conventions

- **Git:**
  - Commit directly to `master`; do not create branches in this project.
  - Commits are signed (personal identity); check that `git log -1 --show-signature` shows "Good signature".
  - Commit only when asked.
- **Headless logic:** game logic takes `Effects` / `SoundSink` interfaces so tests can pass `NO_EFFECTS` / `NO_SOUND`. Keep new gameplay code testable in the same way: no DOM or WebGL in logic classes.
- **Level geometry:**
  - Sides are numbered LEFT 0, RIGHT 1, BOTTOM 2, TOP 3, BACK 4, FRONT 5; `children[side] = -1` means a wall.
  - Wall normals point into the segment.
  - Put doors on narrow necks, not room walls. Call `door()` / `exit()` after the `extrude` that creates the portal.
- **Lights:** the number of lights must stay constant at runtime, or every material recompiles. Use `LightPool` flashes rather than adding or removing lights.
- **Tuning:** gameplay numbers live in `*_TUNING` constants next to their code (`SHIP_TUNING`, `WEAPON_TUNING`, `ROBOT_TUNING`, `REACTOR_TUNING`, …).
- **Look:** untextured flat shading, a cyberpunk palette (`src/render/palette.ts`), emissive LEDs with `toneMapped: false`.

## Verifying in the browser

- The dev server config is in `.claude/launch.json`. Port 5173 is often taken by another local project, so Vite falls back to 5174.
- The built-in browser pane can't capture the mouse and you can't hear audio there. Drive the game through the dev hooks on `window.game` instead: `debugFly(seconds, controls)`, `debugGiveKey`, `debugShip`, `debugPlayer`, `debugRobots`, `debugReactor`, `debugObjective`.
- Particles and simulation only advance while the mouse is captured, or inside `debugFly`.
- The menu overlay covers the canvas; hide it before taking screenshots.
