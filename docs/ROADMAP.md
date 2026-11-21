# VOIDSHAFT: roadmap and status

An original in-browser 6DOF tunnel shooter, inspired by Descent (1995): you fly freely through enclosed mines, fight robots, collect keys, destroy a reactor and escape before the mine collapses. The game uses no Descent names, levels or assets.

_Status as of 2026-11-21: all 8 milestones are done, on `master`. The vertical slice is complete; what's left is hand playtesting and the open items below._

## Decisions

| Area | Choice |
|---|---|
| Stack | Three.js, Vite and TypeScript, with our own physics and collision code (no physics engine) |
| Scope | A vertical slice: one level with the full gameplay loop |
| Levels | Connected "cube segments" (eight-vertex deformable boxes), written in TypeScript and exported to JSON |
| Look | Untextured flat-shaded polygons, a cyberpunk palette, lots of LED strips, bloom. Textures come later, through the material layer in `src/render/Materials.ts` |
| Audio | Synthesised in the browser with WebAudio; no audio files |
| Workflow | Commit straight to `master`, no feature branches. Commits are signed |
| Input | Keyboard and mouse only; gamepad support was dropped from the plan |

## Milestones

| # | Milestone | Status | Commit |
|---|---|---|---|
| 1 | Scaffold | ✅ Done | `252c5d6` |
| 2 | Flight feel | ✅ Done | `252c5d6` |
| 3 | Level system: doors, keys, culling | ✅ Done | `275df7e` |
| 4 | Combat: lasers, missiles, pickups | ✅ Done | `0f52dbf` |
| 5 | Robots and AI | ✅ Done | `db25389` |
| 6 | Objective loop: reactor, countdown, escape | ✅ Done | `2a42b42` |
| 7 | HUD, audio, menus, settings | ✅ Done | `6766f7b` |
| 8 | Polish: performance, automap | ✅ Done | _uncommitted_ |

### What each milestone delivered

**1–2. Scaffold and flight**
- Fixed 120 Hz simulation; the camera is interpolated between steps when drawing.
- Six-degree-of-freedom ship: thrust, strafe, slide up/down, pitch, yaw, eased roll, boost and drag.
- The ship is a sphere that collides with and slides along wall triangles.
- Levels are drawn as bevelled panels with random LED dots and LED strips along the edges, plus bloom and fog.

**3. Level system**
- `LevelBuilder` grows tunnels by extruding a side of an existing segment; `npm run levels` exports them to `public/levels/*.json`, and the game checks the file when loading it.
- Doors open when you fly close and stay shut without the right key (red, gold or blue).
- Portal culling: only segments visible through the chain of openings, closed doors excepted, are drawn.

**4. Combat**
- Shots are swept along their path each step, so fast projectiles can't skip through walls.
- Weapons: twin lasers that cost energy, and homing missiles that seek targets in a cone and only home on what they can see, with splash damage.
- Pickups: shield, energy and missiles.
- Effects come from particles and a fixed pool of flash lights.

**5. Robots** (`src/entities/robots/`)
- Three original types:
  - **Stinger:** fast and fragile; circles and snipes, runs away when badly hurt.
  - **Bulwark:** slow and armoured; fires laser bursts and missiles.
  - **Fuse:** a mine that homes in and blows up on contact.
- They switch between patrolling, attacking, chasing and fleeing.
- They need line of sight to see you, find their way through the tunnels (avoiding closed doors), turn at a limited rate, aim ahead with some spread, warn nearby robots, and sometimes drop pickups.

**6. Objective loop**
- The reactor's core is shielded until its three emitter pylons are destroyed. It fires spreads of lasers, and adds missiles once the shield is down.
- Destroying it starts a 50 s countdown with an alarm and screen shake. The exit door stays sealed until then.
- You have 3 ships. You win by flying out of the exit. You lose if:
  - you run out of ships;
  - the countdown ends;
  - you die during the escape.
- The end screen shows your stats; a click or Enter restarts.

**7. HUD, audio and menus**
- Synthesised sounds for every game event, an engine hum, an ambient drone and an escape siren. Sounds fade with distance and pan left/right.
- Main menu and Esc pause menu.
- Saved settings: mouse sensitivity, invert Y, field of view, three volumes, telemetry toggle, and rebindable keys.
- HUD: hit marker and an incoming-missile warning.

**8. Polish: performance and automap**
- **Measured first.** The whole level is 82 draw calls and about 7,400 triangles; portal culling cuts a typical view to 30–45 calls. Geometry is not the bottleneck, so merging or instancing it would gain nothing. The cost is per pixel: about 19 point lights on every lit surface, plus bloom.
- **Shader warm-up:** every shader is compiled at load with one full render. Before, about 10 shaders compiled mid-game the first time a robot type, the reactor and so on came into view, each causing a stutter.
- **Resolution:** a Resolution setting (50–100% of native, capped at 2× pixel ratio) and an adaptive mode, on by default, that lowers the resolution in 10% steps when frames run slower than about 50 fps and slowly raises it again (`src/render/Resolution.ts`).
- **Telemetry** now shows CPU time per frame, draw calls, triangles and the current resolution. The HUD skips text writes that didn't change.
- **Bundle:** Three.js is split into two cacheable chunks; the game code is 89 kB, and the build no longer warns.
- **Automap** (Tab, rebindable): a wireframe of every segment you have seen, in each segment's accent colour, with doors in their key colour, the exit (red when sealed, green when open), uncollected keys, the reactor and your ship. The mouse turns the view around the ship; the wheel or the forward/back keys zoom. The game is paused while the map is open, including the escape countdown.

## Next

Nothing is planned. Candidates:
- Hand playtesting and tuning (see below).
- Textures, through `src/render/Materials.ts`.
- More levels.
- If fill rate becomes a problem on weak GPUs: bake the static level lights into the wall vertex colours, which would cut the lights per pixel from about 19 to 8.

## Known gaps and open questions

- **Not playtested by hand.** Everything was checked with automated tests and scripted runs in the browser pane, which can't capture the mouse or play sound. The difficulty, the 50 s countdown, the reactor's HP and how the audio sounds all need real play.
- **Resuming right after Esc:** browsers refuse to recapture the mouse for about a second after Esc, so a quick click on RESUME can fail and has to be repeated.
- **Robots can't use doors,** so a closed door shuts them out. This is intended for now.
- **Performance on real hardware** is unmeasured: the numbers above come from the browser pane at 1024×768. Adaptive resolution assumes a 60 Hz or faster display; on a slower display it would drop to 50%, so turn it off there.
- **The automap pauses the countdown,** which makes the escape easier: you can stop and plan the route. Change this if it feels like cheating.
- **ESLint and Prettier** were in the original scaffold plan but were never set up.
- **Textures:** not started, as decided.

## Working on it

```bash
npm install
npm run dev      # dev server (5173, or the next free port)
npm test         # 59 Vitest tests over 7 files
npm run build    # exports levels, type-checks, builds to dist/
```

- Levels are authored in `src/level/levels/*.ts`; run `npm run levels` after editing one.
- `?level=<id>` loads a different level.
- In dev, `window.game` exposes debug hooks: `debugFly`, `debugGiveKey`, `debugRobots`, `debugReactor` and `debugObjective`.
- Turn on "Show telemetry" in the settings for FPS, CPU time, draw calls, triangles and resolution.
