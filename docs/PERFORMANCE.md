# Interaction performance

## Case 01 — brushing in study 08

Keep the character, camera, resolution and two initial winds fixed. Warm the scene,
observe it without input, hold the left mouse button, drag across the grass, then
release. Repeat the press with a pointer-cancellation fixture to check recovery.

The benchmark records frame intervals, time inside terrain raycasting, and the
HUD's CPU submission and GPU render-time measurements. On Linux, it also samples
available GPU utilization counters every 250 ms, retaining timestamps and
mean/p50/p95/max for each device and phase. It checks that contact responds and
recovers, picking stops after release and cancellation, and camera position,
character position, wind count, draw calls and triangle count remain unchanged.
Cancellation uses a synthetic event; the other mouse actions use browser input.

Start the development server, then run in another terminal:

```sh
npm run dev
npm run bench:interaction
```

For an isolated visible browser at desktop resolution:

```sh
npm run bench:interaction -- --headed --width 2560 --height 1440
```

This opens a fresh Firefox profile. Reports and raw samples stay in ignored
`state/interaction-*.json` files. Each report includes the commit, working-tree
state, browser-reported renderer, resolution and pixel ratio. The benchmark uses
the development inspection hook and requires the Vite server.

A one-second sample before opening the benchmark browser records existing GPU
activity. Utilization comes from the driver's `gpu_busy_percent` counter and
covers the whole device, including other applications; it is separate from the
browser's render-time queries. Unsupported counters remain unavailable, and read
failures are recorded. [AMDGPU counter documentation](https://docs.kernel.org/gpu/amdgpu/thermal.html#busy-percent).

The [desktop observations](performance-observations.json) preserve the reported
**~20% utilization on a Radeon RX 9070 XT** for build `index-BigvFBLk.js`.
Each benchmark report includes that reference with its original context. It is
an observation to compare against, not a pass/fail threshold or a controlled
benchmark result.

`npm run test:benchmark` checks counter discovery, zero versus unavailable,
changing samples, read failures and cleanup after an interrupted action.

## Baseline

Measured on 2026-09-26 in headless Firefox 155 at 1440 × 900, 1× DPR, with two winds.
The browser reported an AMD renderer and did not expose GPU timer queries.

| Phase | Mean terrain picking | Picking p95 | HUD CPU submission |
| --- | ---: | ---: | ---: |
| Idle | No queries | — | 1.71 ms |
| Hold | 6.38 ms | 7 ms | 7.88 ms |
| Drag | 6.59 ms | 10 ms | 8.07 ms |
| Released | No queries | — | 1.64 ms |

The rendered work stayed at 99 draw calls and 383,465 triangles. All nine flow
checks passed. Frame intervals stayed near 16.7 ms in this headless session; this
run exposes the CPU penalty, rather than measuring the desktop's maximum frame
rate. At 144 FPS, the entire frame budget is 6.94 ms.

While brushing, `Raycaster.intersectObject(terrain)` runs once per frame. The
terrain contains 200 × 200 cells, each with two triangles. The original mesh
raycaster walked all 80,000 triangles when the ray entered the terrain bounds.
Picking accounts for most of the added CPU time in this case.

The flow checks verify behavior; the timing report is a baseline, not a passing
performance target. Compare measurements on the same browser, machine, viewport
and refresh configuration. Headless scheduling and browser timer precision can
hide changes in throughput. GPU time stays unavailable when the timer extension
is absent; CPU submission includes any synchronous waiting during rendering.

## Accelerated picking

The static terrain now builds a bounding-volume hierarchy with
[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh). A brush query skips
regions the ray cannot reach and returns only the nearest hit. Indirect indexing
preserves the original triangle order. The rendered mesh, grass density, shader
and spring behavior stay the same.

`tests/terrain.spec.ts` compares hit/miss, distance and hit position against the
original linear query over slopes, cell boundaries, distant hills and empty sky.
Oblique rays test repeated surface crossings and near/far clipping. A separate
work-count check requires a representative query to test fewer than 1% of the
original 80,000 triangles, without relying on machine-specific timing thresholds.

The browser benchmark instruments the actual terrain mesh, so it observes the
accelerated implementation as well as the original one. Repeat in a visible
browser at the actual desktop refresh rate to measure the effect on frame times.

The same headless scenario after the change measured **0.062 ms** mean picking
while held and **0.096 ms** while dragging, down from 6.38 and 6.59 ms. HUD CPU
submission during dragging fell from **8.07 to 1.82 ms**. All nine flow checks
passed; draw calls and triangle count stayed unchanged. Per-query timings are
quantized by the browser timer, so these averages are not hardware-cycle measurements.

If interaction still adds substantial cost, split the remaining measurements
between spring integration, texture upload and GPU rendering. Repeated distance
detail updates during simulation substeps are another candidate to measure.
Change one source of cost at a time.

## Continuous detail and spatial winds

The next iteration replaces matrix-based blade instances with shared compact
parameters: 44 bytes per blade instead of 76, a 42.1% reduction in instance-buffer
storage. Detail selection runs once per rendered frame after camera movement.
Density changes per blade; curve morphs finish before a batch drops vertices.
Bounds expand with the current N-source wind collection and possible contact.

The same 1440 × 900 headless Firefox interaction scenario measured 1.84 ms CPU
idle, 1.89 ms held, 1.82 ms dragged and 1.78 ms released. Mean picking was 0.083 ms
held and 0.060 ms dragged; all nine flow checks passed. The smoother detail and
conservative bounds submitted 101 calls and 430,147 triangles, compared with
99 and 383,465 before this iteration. These changes improve continuity and reduce
resident instance data; they are not evidence of higher GPU throughput. The
browser still provided no GPU timers.

The close-up refinement adds an eight-segment ribbon and scales detail with
viewport resolution and field of view. Density thins later and retains at least
half the blades, limiting survivor widening to 2×. At 1440 × 900, the same route
now submits 796,359 triangles in 101 calls. CPU samples were 1.89 ms idle,
1.94 ms held, 1.86 ms dragged and 1.81 ms released; mean picking was 0.079 ms held
and 0.044 ms dragged. All nine checks passed. The extra geometry serves visible
shape and coverage; GPU cost still needs hardware timing.

`tests/grass-lod.spec.ts` renders alternate topology at completed morphs and compares
pixels. It also compares the conservatively trimmed draw against the full batch:
removed instances contribute no visible pixels. A round-trip distance sweep checks
that trimming never excludes a blade with nonzero width. The four topology views
must share instance buffers.

`tests/spatial-wind.spec.ts` runs the production wind function through WebGL 2
transform feedback. It checks finite centers, tangent direction, edge falloff,
translation, reversal and the sum of five independently placed sources. Interface
coverage follows add → place → brush → reverse → cancel → remove → reset, including
pointer cancellation and changing studies during placement. These are authored
vector fields; a fluid solver is outside this iteration.

Research and the next comparisons are in
[A blade nearby, a field in the distance](../research/rendering-performance.md).

## Highlight detail

A luminous edge needs enough pixels to remain an edge. When blades become narrow,
constant pixel-width outlines fill them with light and obscure the field beneath.
The highlight now measures the projected ribbon width and fades its outline across
2–5 pixels. Distance fades the outline first, then the blue/orange tint, using the
same viewport/FOV scale as blade detail.

Three material variants share the instance buffers and simulation. Once every
root in a patch has finished its outline fade, a variant omits edge derivatives.
After the color fade finishes, another also omits response-color calculations.
The wind and contact displacement still shape the blades at every distance.
There is no extra highlight render pass. **Force view / Tab** fades the shared
visualization over 450 ms. The same palette now reaches moving cards, wet blades,
the foundation and each short-cover representation. Wet blades retain the same
outline/color material simplification by distance. **V** changes wind tint over 300 ms.
Enabled contact tint stays blue when the wind overlay is off. **B** independently
fades contact tint over the same duration.

`tests/highlight.spec.ts` checks both tint switches, their four rendered color
combinations, the keyboard/button round trip, editable-input
exclusion, key repeat, and continuous animation. A fixed rendered fixture checks
unchanged silhouettes when toggling, preserved contact color, intermediate fade
states, and matching pixels where material variants switch. Tiny color rounding
between compiled variants is allowed; silhouette changes are not.

`tests/force-view.spec.ts` covers the master fade, reversal, filter retention,
study navigation and keyboard focus. Frozen renders check each moving
representation, matching draw/triangle counts and contact data with the view
on and off. The sample-count explanation retains its own colors. A comparison
against the preceding implementation also produced identical pixels for all
12 wind/contact combinations in the frozen 06–08 blade fixture.
The shared-view render check passed in Firefox and Chromium/SwiftShader; the
complete control flow passed in Firefox. The Chromium software-rendered flow
exceeded its 120-second deadline during the later studies, consistent with the
full-scene limitation noted below.

Run the render comparisons in Firefox with
`npm test -- --project=firefox-render`. The interaction report also records the
highlight switch, transition weight and material-detail patch counts alongside
its utilization samples.

## Wind patch handoff

Study 08 can compare direct wind with a distance blend into shared wind samples.
Run the same interaction route with each choice:

```sh
npm run bench:interaction -- --wind-detail direct
npm run bench:interaction -- --wind-detail blended
```

Reports include the active wind windows, handoff weight, pass count and tint
settings. The two-wind headless comparison passed the interaction checks on both
paths. It did not establish a reduction in whole-device GPU utilization. Source
count, camera travel and sampling resolution remain important comparison axes.

The sampled path uses two 266 × 266 RGBA16F targets, about 1.08 MiB in total.
A stationary window evaluates 70,756 sample locations per frame; an overlapping
handoff evaluates two windows. There are 16 intervals across each 12-meter patch,
with matching endpoint samples and guards. A 300 ms fade carries the same wind
phase between windows; near-to-far evaluation blends over projected distance.

Spatial sources of radius 4 m or less remain direct. Their contribution moves
smoothly into the cache between radii 4 and 8 m. This keeps tight vortices from
being flattened by interpolation. When no fine sources exist, the residual loop
is skipped. Contact remains in the original world-space spring field.

`tests/wind-patches.spec.ts` checks negative coordinates, slot reuse, GPU vector
error, tile seams, rapid movement and reversal, live edits during handoff, disabling
and resuming sampling, render-target restoration and direct fallback. The tint
tests check that all four visualization combinations preserve the same bend.
`tests/grass-lod.spec.ts` also exercises topology transitions with sampled wind.


## Study 09 — rain and wet materials

Rain adds one draw with 16,000 instanced quads (32,000 submitted triangles), plus
one procedural sky draw. Seeds and terrain heights upload once. A 48-meter rolling rain volume spends
those instances near the view; wrapping occurs beyond the 23-meter fade limit. The vertex shader
evaluates the source collection for each streak; cost therefore grows with wind
count. Transparent overlap adds pixel work. Visible density fades with rainfall,
but all instances are still submitted until rainfall reaches zero.

The wet material adds clearcoat and environment sampling to the existing surfaces.
Shared dry materials share one wet counterpart. A small procedural environment is
prefiltered on the first visit to 09 and reused; there is no per-frame environment
capture. Returning to an earlier study fades these changes out and restores the
original materials. The inactive weather skips rendering and material updates.

Weather tests exercise rain → wet surface → stopped rain → drying, day → night,
control-panel handoffs, brushing and a round trip through 08. State integration is
compared at 60 and 144 steps per second with a long-gap clamp. A rendered fixture
holds geometry and base color fixed while changing roughness, checking both the
reflection and unchanged silhouette. These checks establish behavior; an isolated
GPU cost comparison for rain and wet shading remains to be measured.


The 2026-09-27 validation passed 21 Firefox checks across presentation, narration,
LOD, highlights, wind patches and weather. Chromium with SwiftShader passed the
roughness render and state-integration checks, but the complete presentation and
weather flows exceeded their transition deadlines. In the reduced-resolution
weather run, the night blend reached 0.832 within the 15-second deadline instead
of 0.95. Full Chromium flow coverage therefore remains unresolved; these software
runs are not evidence of desktop GPU performance.


Rain visibility has a rendered regression test: a frozen landscape is drawn with
rain on and off at 1× and 2× pixel density, in daylight and at night. Resolved CSS
pixels must retain contrast against both the sky and foreground; stopping rain
must remove its contribution. The original full-landscape distribution failed
this check, especially in the foreground. The same 16,000-instance budget now
occupies the local view, with wider, brighter streaks and a stable CSS footprint.
This increases visible rain coverage and pixel work without increasing the draw
or instance count.

## Ground-cover exhibits 10–13

The interaction benchmark accepts `--study 10` through `--study 13`, with
`--tufts cards` for study 11 and `--hide-tall` to inspect the lower representation
without the tall-blade anchor. All modes use the same idle → hold → drag →
release → cancel flow. Reports include the chosen representation.

```sh
npm run bench:interaction -- --study 11 --tufts cards
npm run bench:interaction -- --study 12 --hide-tall
```

The 2026-09-27 run used isolated headless Firefox 155, 1440 × 900, 1× DPR, two
winds, no falling rain, and the default starting camera. Tall blades remained
visible. All nine interaction checks passed for each of the five configurations.
Counts include the complete scene and shadow passes. The representations have
different visual coverage; these are observations of the exhibits, not an
image-matched ranking of algorithms.

| Study / representation | Draw calls | Submitted triangles | Idle CPU submission | Drag CPU submission | Idle device utilization |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 / surface foundation | 109 | 797,433 | 2.69 ms | 2.63 ms | 17.8% |
| 11 / solid tufts | 144 | 1,761,261 | 3.02 ms | 2.80 ms | 18.6% |
| 11 / painted clusters | 144 | 904,525 | 2.91 ms | 2.75 ms | 17.8% |
| 12 / 12 shells and fins | 179 | 975,513 | 3.49 ms | 3.22 ms | 31.7% |
| 13 / up to 24 implicit samples | 144 | 807,513 | 3.11 ms | 2.93 ms | 18.8% |

Device utilization includes other applications; the one-second pre-browser
samples averaged 0.8–7.8%. Firefox did not expose GPU timer queries. Frame-interval
p95 stayed near 17.1 ms under headless scheduling, which does not establish the
desktop's maximum frame rate. The browser's generalized renderer label was
“Radeon R9 200 Series, or similar”; it is preserved as reported rather than used
to identify the physical card. [Measurement summaries](ground-cover-measurements.json).

Rendered tests also verify that separating shells and showing sample visits
change the image, and that increasing shell count submits more geometry.
Rendered tests isolate the lower layers with the tall blades hidden and rain
disabled. An explicit material mask distinguishes raised coverage from the ground
foundation. Fixed frames check visible contribution, contact deformation,
recovery, full disappearance at zero transition coverage, and preservation of
opaque canvas alpha. Low, medium and high camera views check that a small camera
movement retains covered area. An intersecting object remains visible and its
result does not depend on draw submission order. These rendered checks pass in
Firefox and Chromium; [results](ground-cover-render-checks.json) include coverage
and contact differences. The alpha check catches bright compositing fringes from
multisample cutouts. Contact-source tests compare character, brush and object
inputs and recovery at 60 and 144 integration steps per second.

The UI flow changes construction, separates shells, reveals sample visits,
places and removes a stone, adds a vortex, changes weather, returns to bare
ground and revisits the new studies. Full-gallery navigation keeps every earlier
representation reachable. Broader high-DPI camera routes, shell sampling LOD and
isolated GPU timings remain refinements alongside the exhibits.
