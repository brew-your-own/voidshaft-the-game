# VOIDSHAFT: roadmap and status

An original in-browser 6DOF tunnel shooter, inspired by Descent (1995): you fly freely through enclosed mines, fight robots, collect keys, destroy a reactor and escape before the mine collapses. The game uses no Descent names, levels or assets.

_Status as of 2026-11-22: milestones 1–8 (the vertical slice) and 11 (enemy designs) are done, on `master`. Next: 9, a level selector with a map viewer, then 10, five bigger levels._

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
| 8 | Polish: performance, automap | ✅ Done | `4e47e0f` |
| 9 | Level selector and map viewer | ⏳ Next | — |
| 10 | Five bigger levels | Planned | — |
| 11 | Enemy ship designs | ✅ Done | _uncommitted_ |

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

**11. Enemy ship designs** (done before 9 and 10)
- Nine proposals, three per robot type, were compared on a turntable page. The picks:
  - **Stinger, "Mantis":** needle body with two mandible blades sweeping forward past the nose like pincers, LEDs along the blade edges, red eye slit.
  - **Bulwark, "Obelisk":** tall armoured diamond with one big cyclops eye, circled by a turning ring of four gun pods.
  - **Fuse, "Urchin":** hot core glowing through gaps in its armour, needles of uneven length with glowing tips.
- Behaviour, hit sizes and tuning are unchanged. The stinger and fuse models are scaled to 0.8 to stay close to their collision spheres.
- **Reflections:** robot hulls are metallic, and metal lit only by point lights looks almost black. They now reflect a "neon room" map (`src/render/NeonEnvironment.ts`); level walls are unaffected.
- **Moving parts:** models can list spinning parts (`RobotMesh.spin`), which `Robot` turns every frame; the Obelisk's gun ring uses it.
- **Draw calls:** each model is built from many parts, then merged into one mesh per material (`mergeByMaterial` in `meshKit.ts`). The 13 robots in `level01` cost 63 draw calls instead of 271.
- **Shipyard:** `/shipyard.html` (dev server only) shows every robot model on a turntable at true scale, next to any proposals in `src/entities/robots/proposals.ts`. Click a name for a close-up, drag to turn it, ← → to step through, R for the collision sphere. The six unpicked proposals are in git history.

## Next

### 9. Level selector and map viewer

- **Level list:** `npm run levels` also writes `public/levels/index.json`, listing each level's id, name, number of segments and robots.
- **Title screen:** a level picker replaces the single FLY button: one row per level, with FLY and VIEW MAP buttons. The choice goes into `?level=` and is remembered.
- **Map viewer:** reuses `AutomapView` to show a whole level without playing it:
  - every segment visible;
  - the camera orbits the level's centre rather than the ship;
  - markers for the start, keys, doors, robots (by type), the reactor and the exit.
- **Why first:** milestones 10 and 11 need it, to review new levels and enemies at a glance.

### 10. Five bigger levels

- Five levels in increasing size and difficulty, each larger than `level01` (32 segments), up to roughly 100–150 segments for the last one.
- Each level gets:
  - its own colour theme and name;
  - a key progression (blue → gold → red);
  - a reactor and an exit;
  - loops and side branches, so the layout isn't one long corridor.
- **Decision to make:** keep `level01` as the first level, or turn it into a short training level.
- **Tooling:**
  - `LevelBuilder` helpers for rooms, junctions and loops, so big levels stay readable;
  - a solvability test for every level: starting with no keys, flying only through doors you can open, you must reach every key, then the reactor, then the exit;
  - tests that every robot, pickup and light sits inside its segment with clearance from the walls.
- **Performance:** check draw calls and culling on the biggest level.

### Other candidates

- Hand playtesting and tuning (see below).
- Textures, through `src/render/Materials.ts`.
- Baked static lighting (see below), if the game runs slowly on high-resolution screens or weak GPUs.

### Future option: baked static lighting

**Problem.** Three.js lights every pixel of every lit surface with every light in the scene, on every frame. The level's ~11 fixed point lights never move and neither do the walls, so their effect on a wall is the same each frame, yet it is recomputed for every pixel. With the headlight, the reactor glow, the 6 flash lights and the two hemisphere lights, that's about 19 lights per pixel.

**Idea.** When `LevelMesh.ts` builds the walls, compute each fixed light's diffuse contribution at every wall vertex, using the same distance falloff as Three.js. Add it to the vertex colour the walls already carry, then leave those lights out of the scene. Lights per pixel drop from about 19 to 8 (headlight, flashes, reactor, hemisphere lights), roughly halving the lighting cost. Descent did the same: static lighting stored per vertex, only flashes lit dynamically.

**Trade-offs.**
- Lighting is only computed at each triangle's corners and blended in between. The panels are small, so this should look fine, but a lamp very close to a wall won't make a sharp hotspot.
- No shiny highlights from the fixed lights, since highlights depend on the camera position. The headlight and flashes still produce them.
- Robots, doors, pickups and the reactor are no longer lit by the room lamps. Fix: give each segment an ambient colour sampled from the baked light and tint objects inside it.
- Fixed lights can't flicker or switch off unless the affected segments are re-baked.

**When.** Not needed now: the browser pane measured about 3 ms of rendering per frame at 1024×768. Measure on a high-resolution screen first; adaptive resolution may be enough.

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
npm test         # 64 Vitest tests over 8 files
npm run build    # exports levels, type-checks, builds to dist/
```

- Levels are authored in `src/level/levels/*.ts`; run `npm run levels` after editing one.
- `?level=<id>` loads a different level.
- In dev, `window.game` exposes debug hooks: `debugFly`, `debugGiveKey`, `debugRobots`, `debugReactor` and `debugObjective`.
- `/shipyard.html` shows the robot models on turntables, for reviewing designs.
- Turn on "Show telemetry" in the settings for FPS, CPU time, draw calls, triangles and resolution.
