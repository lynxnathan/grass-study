# grass, not what you think.

[Enter the field](https://grass.capybaragpt.xyz/) ·
[Where winds meet — 08](https://grass.capybaragpt.xyz/?s=8) ·
[When the rain arrives — 09](https://grass.capybaragpt.xyz/?s=9) ·
[Between the blades — 10](https://grass.capybaragpt.xyz/?s=10)

An interactive study of grass rendering, wind and contact, presented in WebGL.

Fourteen steps go from bare ground and textured cutouts to curved blades, traveling
gusts, spring recovery, spatial winds, rain and several ways to fill the ground
between the blades. Walk through the field, brush the grass, and change the winds
to see how they combine. Color makes the forces
visible; the Stats overlay shows the rendering cost.

The terrain, character and camera stay in place between steps. Grass fades as
the technique changes; entering or leaving the weather-enabled studies also
eases the weather and lighting into place. See the [study notes](docs/STUDIES.md) for how
each works, and the [roadmap](ROADMAP.md) for further experiments.

## Run

Requires Node.js 22.12+ (developed with Node.js 24), npm, and a WebGL 2 browser.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Runtime assets and dependencies are served
locally; playing does not require a CDN or external service. No editor is needed.

## Play

The interface follows the system’s light or dark theme and updates immediately
when that preference changes, including native form controls.

Each study opens a short passage with a gradual text reveal. Complete it or close
it whenever you like; it stays open until dismissed, and the field keeps moving.
Drawn arrows and soft rings point to the controls mentioned in the passage.
Reduced-motion preferences show the whole passage immediately. Wind controls,
rendering statistics and control hints are available from the small toolbar.

Link to a study with `?s=8`. The address follows the selected study, so copying
the URL shares what you are looking at. Missing or invalid study numbers open 00.

- **R / Read:** open or close the current passage. **Enter** while the scene has
  focus completes the text, then closes it on a second press. **Escape** closes it
  immediately. **Under the surface** expands the rendering notes.
- **Controls:** show movement and navigation hints.
- **Tab / Force view:** fade the blue/orange force visualization in or out while
  the scene has focus. The same view follows wind and contact across moving cards,
  blades, wet grass and the ground-cover studies. Motion continues underneath.
  **Shift+Tab** enters the toolbar; Tab within controls navigates normally.
- **V / Wind highlights** and **B / Contact tint:** filter the shared view.
  Contact alone is blue; over wind-blue grass it turns orange. Both switches
  live inside **Winds**. Choices carry between studies and survive hiding the view.
- **0–9:** jump to the matching numbered study.
- **H / L:** previous / next study. Side arrows and Page Up / Page Down work too.
- **WASD / arrows:** move relative to the camera.
  Movement keys also work while toolbar buttons have focus. Editable fields and
  browser shortcuts retain their normal keyboard behavior.
- **Shift:** run.
- **Right-drag:** orbit the camera. **Scroll:** adjust distance. Orbit and zoom ease toward input with a short,
  frame-rate-independent response; movement follows the visible camera heading.
  In studies 06–13, hold and drag **left mouse** to brush the grass. Context menus
  and text selection are disabled
  over the scene; interface buttons retain their normal behavior.
  Scene pointer/mouse events are cancelled and contained at the canvas, including
  click, auxiliary click, drag and selection events. Non-interactive overlays pass
  input through. Pointer capture preserves drags across overlays; overlapping mouse
  buttons retain their independent roles.
  Interrupted pointer input and loss of focus clear held controls and stop movement.
  The field keeps animating, and camera and movement controls remain available. For Firefox,
  set `dom.event.contextmenu.shift_suppresses_event` to `false` in `about:config`
  to allow sprint + right-drag together. The app does not change browser preferences.
- **Start over:** return to the original location and camera.
- **Winds:** from study 04 onward, open a wind’s row to adjust its heading
  and strength, reverse it, oppose the first wind, or remove it. Rows fold away
  individually; newly added winds open for editing. Study 08 adds independent
  origins, radial flows and vortices. **Add wind** and **Add vortex** give each new source different starting
  parameters and an origin across the field. Existing sources keep their settings.
  Use **Place on ground** to position a source;
  **Escape** cancels placement. In 08, **Blend wind detail** compares direct
  evaluation with distance-blended patch sampling. Moving between patches carries
  the same wind phase and contact state through the handoff.
- **Weather:** in 09–13, change rainfall, move from day into night, or stop the rain
  and watch the ground dry. **Follow the light** reveals a roughness control:
  change how widely the wet surface spreads its reflection. Wind and contact
  still move the grass; **Tab** hides the force colors to follow the wet surface’s light.
- Touch devices have directional buttons, a running toggle, and one-finger camera drag.
- **F3 / Stats:** toggle the performance HUD. Its visibility is remembered locally;
  it starts hidden.

The HUD shows FPS, mean/p95 frame time over a rolling three-second window, CPU
update/render-submission time, GPU render time when timer queries are supported,
draw calls and submitted triangles (including shadow passes), and drawing-buffer
resolution/DPR. The dashed graph line marks 16.7 ms (60 FPS). CPU time is not CPU
utilization, and the browser does not expose portable VRAM/temperature metrics.
GPU queries are asynchronous, sampled every fourth frame, bounded in number, and
discarded after disjoint events. Hiding the HUD stops its sampling. Returning from
a hidden tab resets the measurement window.
Rendering follows the browser's `requestAnimationFrame` cadence; there is no
application-level 60 FPS cap. The 1/60-second simulation substep is a maximum
integration step, not a render-rate limit.
The browser controls background frame scheduling. Long gaps are capped to keep
the simulation stable when frames return; the scene has no pause/resume mode.

Desktop keyboard/mouse and performance are the study's primary target. Touch and
responsive layout are lightweight fallbacks, not a separate mobile experience.

The character follows the actual terrain triangles. This first controller has
no jumping, rigid-body physics, foot IK, or rock collisions. The root stays on
the surface; individual animated feet can intersect slopes. Movement is bounded
to the interior of the landscape. Grass techniques range from static cutouts to
curved, wind-driven blades with contact and recovery.

In **10–13**, open **Layers** to reveal the ground weave, tall blades and short
cover separately. Each representation stays available as its own study: solid
or painted tufts, shells with fins, and implicit volume samples. Separate the
shells or reveal sample visits to see their construction. **H / L** and the side
arrows continue past 09; links such as `?s=13` open any study directly.

**Layers → Objects can touch it too** places stones on the ground. Objects,
footsteps and the mouse brush contribute to the same spring field; removing a
stone releases its contact. These are stationary contact sources, ready for a
later physics tick to supply moving transforms and footprints.

## Develop

```sh
npm run build
npx playwright install chromium firefox
npm test
```

Reading tests cover reveal, completion, dismissal, reopening, rapid stage changes,
reduced motion, live theme changes and switching between reading and wind editing.
Presentation tests traverse all fourteen techniques forward and backward, compare
rendered states, preserve the character and camera, and exercise rapid navigation, reduced
motion, wind, brushing and recovery. Browser input tests exercise walking/running/idle,
skeletal animation, contact with
the rendered terrain, camera controls, focus-loss recovery, reset, failed asset loading
and retry, and a narrow touch layout. HUD tests cover live render counters,
visibility persistence, unsupported GPU timing, and a controlled timer fixture
for asynchronous query limits/disjoint recovery. That fixture tests the timer
contract; it does not benchmark real GPU performance. Tests use isolated headless
Chromium with software WebGL. Isolated Firefox also covers mouse/keyboard input
and rendered LOD/highlight/weather comparisons (`npm test -- --project=firefox-render`).
Highlight checks cover the gradual toggle, unchanged silhouettes, retained contact
color and transitions to simpler shaders.
Weather tests cover wetting, drying, interrupted sky transitions, control-panel
round trips and restoration of the earlier landscape. A fixed-surface render
checks that roughness changes the reflection with color and geometry held constant.
Rain visibility is checked against sky and foreground at normal and high pixel
densities, including daylight, night and stopped rain.
Screenshots remain in ignored local directories.

`npm run bench:interaction` measures idle, held, dragged and released grass
interaction in study 08, including native GPU utilization where available.
`npm run test:benchmark` checks the native sampler. See [the performance case](docs/PERFORMANCE.md) for the
scenario, baseline and optimization plan.

- `src/studies.ts`: presentation sequence and grass fade transitions.
- `src/narration.ts`: reader-controlled passages and text reveal.
- `src/presentation.css`: quiet navigation and passage typography.
- `src/field.ts`: crossed cards, curved blades, wind shaders and distance detail.
- `src/patch-grid.ts`: shared world-space patch identities and modulo storage slots.
- `src/wind-patches.ts`: sampled wind windows and overlapping handoffs.
- `src/wind-shader.ts`: full, broad and fine wind evaluation on the GPU.
- `src/wind.ts`: an editable collection of wind vectors, its GPU texture and controls.
- `src/interaction.ts`: shared displacement field and spring recovery.
- `src/grass.ts`: seeded tufts, procedural cutout texture, upright billboards.
- `src/ground-cover.ts`: surface detail, short tufts, shells/fins and implicit slices.
- `src/cover-controls.ts`: layer reveals and placed contact objects.
- `src/weather.ts`: instanced rain, wet materials, procedural sky and gradual weather.
- `src/terrain.ts`: deterministic landscape, triangle-exact height queries, surface normals.
- `src/player.ts`: imported skeleton, animation transitions, locomotion.
- `src/camera.ts`: follow/orbit camera and terrain clearance.
- `src/input.ts`: keyboard and touch input.
- `src/main.ts`: rendering and the study lifecycle.
- `src/performance.ts`: rolling frame statistics and asynchronous GPU timing.

See [the study sequence](docs/STUDIES.md), [grass research](research/research.md),
[rendering across engines](research/rendering-performance.md),
[continuous ground cover](research/ground-cover.md),
[asset provenance](docs/SOURCES.md), and [deployment](docs/DEPLOYMENT.md).
