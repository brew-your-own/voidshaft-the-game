# VOIDSHAFT: roadmap and status

An original in-browser 6DOF tunnel shooter, inspired by Descent (1995): you fly freely through enclosed mines, fight robots, collect keys, destroy a reactor and escape before the mine collapses. The game uses no Descent names, levels or assets.

_Status as of 2026-11-22: milestones 1–12 are done, on `main`. Next: hand playtesting and tuning._

## Decisions

| Area | Choice |
|---|---|
| Stack | Three.js, Vite and TypeScript, with our own physics and collision code (no physics engine) |
| Scope | Six levels with the full gameplay loop (it started as a one-level vertical slice) |
| Levels | Connected "cube segments" (eight-vertex deformable boxes), written in TypeScript and exported to JSON |
| Look | Untextured flat-shaded polygons, a cyberpunk palette, lots of LED strips, bloom. Textures come later, through the material layer in `src/render/Materials.ts` |
| Audio | Synthesised in the browser with WebAudio; no audio files |
| Workflow | Commit straight to `main`, no feature branches. Commits are signed |
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
| 9 | Level selector and map viewer | ✅ Done | `41d51bc` |
| 10 | Five bigger levels | ✅ Done | `5bffdc9` |
| 11 | Enemy ship designs | ✅ Done | `2e03707` |
| 12 | Juice: escape sequence, wall detail, explosions, heavier sound | ✅ Done | (this commit) |

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

**9. Level selector and map viewer**
- `npm run levels` also writes `public/levels/index.json`: each level's id, name and counts, in the order of `LEVEL_SOURCES`.
- **Title screen:** one row per level, with its size and robot count. The loaded level has FLY; the others have LOAD, which reloads the page with `?level=` (so a second click on FLY starts it). Every row has MAP. The last level picked is remembered (`voidshaft.level` in local storage); an explicit `?level=` wins.
- **Map viewer** (`src/ui/MapViewer.ts`): the whole level as a wireframe, using the automap renderer in an overview mode that frames the level's centre. It marks the start, doors (exit in green), keys, the reactor and every robot by type. Drag to turn, right-drag or Shift-drag to pan, wheel to zoom, Esc or BACK to return. It can show any level, not just the loaded one.
- Map markers now grow when zoomed out, in the viewer and the in-game map.

**10. Five bigger levels**
- **Level list:** `level01` stays as the short first level; five new ones follow, each with its own name, colour theme (accents, fog and ambient light) and a blue → gold → red key progression, then the reactor, then the exit:

  | Level | Segments | Robots | Floors | Countdown |
  |---|---|---|---|---|
  | 02 Cinder Lanes (amber foundry) | 59 | 17 | 2 | 50 s |
  | 03 Glasswater Depot (cyan coolant depot) | 77 | 24 | 3 | 55 s |
  | 04 Verdant Stacks (green hydroponic towers) | 92 | 29 | 4 | 60 s |
  | 05 Choir of Wires (violet relay cathedral) | 111 | 35 | 2 | 70 s |
  | 06 Null Spire (ice core round a 3-floor atrium) | 132 | 43 | 3 | 75 s |

- **`GridLayout`** (`src/level/GridLayout.ts`): levels are drawn as ASCII maps, one per floor, one character per cube segment. Face-adjacent cells link automatically (except character pairs listed in `separate`), so rooms are blocks of cells and loops come for free; doors go on "the only portal between character X and Y". Cells share lattice vertices, so they can't overlap. A random shear (`warp`) makes floors ramp and walls lean while every face stays a flat parallelogram: each coordinate's offset is a sum of functions of the other two lattice indices.
- **Shared parts** (`src/level/levels/parts.ts`): the reactor chamber and the exit tunnel are extruded off the grid; robots, pickups and lights are placed by grid cell. `LevelBuilder` gained `link()`, `theme()` and pylons in other segments.
- **Fixed-light pool** (`src/fx/StaticLights.ts`): the scene always has 12 point lights for the level's fixed lights; each frame the lights whose range reaches closest to the camera get a slot, fading out and in when a slot changes light. Lighting cost no longer grows with level size, and the light count stays constant. `level01` has 11 lights, so it is unchanged.
- **Tests** (`tests/levels.test.ts`, run on every level):
  - solvability (`src/level/progression.ts`): starting with no keys and flying only through doors you can open, every key is reachable, then the reactor, then the exit, and the exit is sealed until then. The new levels must take exactly blue, gold, red, with the reactor only after red;
  - faces are flat, segment centres resolve to their own segment, and no two segments overlap;
  - every robot, key, pickup, the reactor, its pylons, the start and every light sit inside their segment, clear of the walls;
  - each new level is bigger than `level01`, has at least 3 loops and a theme, and the list grows in size.
- **Measured** on Null Spire in the browser pane: 63 draw calls and 24 visible segments in the atrium, about 1 ms of CPU per frame; the simulation costs about 0.11 ms per step with 40 robots.
- Grid cells are small, so lights placed through `parts.lights()` are scaled down (`GRID_LIGHT_SCALE`); pale accents (ice, white) need lower intensities still, or the walls wash out under bloom.

**11. Enemy ship designs** (done before 10)
- Nine proposals, three per robot type, were compared on a turntable page. The picks:
  - **Stinger, "Mantis":** needle body with two mandible blades sweeping forward past the nose like pincers, LEDs along the blade edges, red eye slit.
  - **Bulwark, "Obelisk":** tall armoured diamond with one big cyclops eye, circled by a turning ring of four gun pods.
  - **Fuse, "Urchin":** hot core glowing through gaps in its armour, needles of uneven length with glowing tips.
- Behaviour, hit sizes and tuning are unchanged. The stinger and fuse models are scaled to 0.8 to stay close to their collision spheres.
- **Reflections:** robot hulls are metallic, and metal lit only by point lights looks almost black. They now reflect a "neon room" map (`src/render/NeonEnvironment.ts`); level walls are unaffected.
- **Moving parts:** models can list spinning parts (`RobotMesh.spin`), which `Robot` turns every frame; the Obelisk's gun ring uses it.
- **Draw calls:** each model is built from many parts, then merged into one mesh per material (`mergeByMaterial` in `meshKit.ts`). The 13 robots in `level01` cost 63 draw calls instead of 271.
- **Shipyard:** `/shipyard.html` (dev server only) shows every robot model on a turntable at true scale, next to any proposals in `src/entities/robots/proposals.ts`. Click a name for a close-up, drag to turn it, ← → to step through, R for the collision sphere. The six unpicked proposals are in git history.

**12. Juice: escape sequence, wall detail, explosions, heavier sound**
- **Escape** (`src/fx/EscapeSequence.ts`): once the reactor dies, the level lights strobe red (`StaticLights.setAlarm`), the fog and background turn red, the camera rumbles, sparks fall, a klaxon blasts, and a synthesised voice counts down the last ten seconds. An on-screen marker points along the shortest route to the exit. `debugEscape()` starts it.
- **Wall detail** (`src/render/WallDetail.ts`, `src/level/wallPanels.ts`): the wall material draws plate seams, rivets, vents, hazard stripes and some glowing seams procedurally, from per-vertex panel coordinates. No textures.
- **Explosions:** pooled shockwave shells and rings (they fade near the camera so a close blast doesn't white out the screen), bouncing debris, embers, trauma-model camera shake (view-only, can be turned off in settings), and a red vignette with colour fringing when you take damage (`HitFlashPass`).
- **Sound:** a bass shelf and a synthetic reverb on the effects bus (`AUDIO_TUNING`), a `drive()` distortion helper, and new laser (Pulse blaster), explosion (Thunder) and hit (Hull clang) sounds. The hit sound follows the damage taken. The picks were made on `/soundlab.html` (dev server only), which plays every variant in `src/audio/variants.ts` and has bass and reverb sliders.

## Next

### Candidates

- Hand playtesting and tuning (see below), now across six levels: robot counts, pickups and countdowns per level are first guesses.
- A level-complete flow: winning currently ends on the end screen; going on to the next level is a reload from the title screen.
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
- **New levels unplayed by hand:** they pass the solvability and placement tests and were flown with scripted runs, but nobody has played them through. Light levels were tuned from a few screenshots only.
- **Grid look:** the grid levels are blockier than `level01`'s hand-extruded tunnels (the shear helps). Mixing in more extruded side tunnels and rooms would add variety.
- **Level04 green wash:** lime LEDs bloom much more than violet ones, so level04 looks washed out. LED brightness could be scaled by colour.
- **Light pool popping:** in a big level a distant room can lose its lamp when 12 closer lights win the slots; it fades rather than pops, but it may be visible in long sight lines.

## Working on it

```bash
npm install
npm run dev      # dev server (5173, or the next free port)
npm test         # Vitest tests over 11 files
npm run build    # exports levels, type-checks, builds to dist/
```

- Levels are authored in `src/level/levels/*.ts` (the new ones as `GridLayout` maps); run `npm run levels` after editing one.
- `?level=<id>` loads a different level.
- In dev, `window.game` exposes debug hooks: `debugFly`, `debugGiveKey`, `debugRobots`, `debugReactor` and `debugObjective`.
- `/shipyard.html` shows the robot models on turntables, for reviewing designs.
- Turn on "Show telemetry" in the settings for FPS, CPU time, draw calls, triangles and resolution.
