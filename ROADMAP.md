# Roadmap

An evolving gallery of rendering techniques, beginning with traversable grass.
Each study makes a technique visible through movement and interaction.
The explanations grow alongside the images: shape, motion, mathematics and cost
are all part of the experience.

## Current — 0.1.0

- Studies 00–13 in one persistent landscape: bare ground, billboards, crossed
  cards, sway, traveling gusts, curved blades, contact and recovery, distance
  detail, and editable wind sources. Study 07 draws inspiration from Ghost of
  Tsushima; 08 introduces spatial composition; 09 brings rain, surface wetness
  and a gradual passage from daylight to night.
- An imported, animated character, hills and a smooth orbiting camera. Grass-only
  transitions, number shortcuts, H/L navigation and shareable links such as `?s=8`.
- Rainfall, gradual wetting/drying and roughness controls. A procedural sky,
  clouds, fog and lighting move together; earlier studies recover their original
  conditions on return. Rain streaks use the existing spatial winds.
- N wind sources with independent origins: directional flows, radial flows and
  vortices. Add, remove, turn, strengthen, reverse and oppose. In 08, each added
  wind starts with varied parameters; existing sources keep their settings.
  Each source has a collapsible row showing its direction or flow type and
  strength. New sources open for editing; folding a row preserves its settings.
- **Force view / Tab:** one shared blue/orange visualization across moving cards,
  blades, weather and ground-cover representations, with a 450 ms fade in/out.
  **V / B** filter wind/contact independently and retain their settings between
  studies. Existing force, bend and recovery mathematics remain in the studies.
- Grass and wind share world-space patch identities. In 08, direct evaluation
  blends into sampled broad winds with distance; small spatial sources stay
  direct. Two modulo-addressed wind windows carry phase through a gradual handoff.
  **Blend wind detail** provides a direct-evaluation comparison.
- Highlight detail fades with projected width and distance. Outlines disappear
  before the tint; simpler shaders take over after each effect reaches zero.
- Reader-controlled passages with gradual lettering, optional technical notes,
  soft control hints, system light/dark themes and a quiet toolbar.
- Continuous animation with input interruption recovery. **F3 / Stats** exposes
  frame times, render counters and GPU timing where the browser supports it.
- Terrain picking accelerated by a BVH. Grass uses a separate grid of batches
  with visibility bounds, compact shared instance buffers, continuous density
  and curve transitions, and eight-segment ribbons nearby in 07–09.
- Ground-cover exhibits 10–13: surface weave, solid/cutout short tufts, shells
  with fins, and implicit volume slices. Layer reveals expose each construction;
  weather and lighting remain available. Placed stones share contact and recovery
  with the character and mouse brush.
- [Tests and performance measurements](docs/PERFORMANCE.md): interaction flows,
  rendered LOD/highlight comparisons, and an idle → hold → drag → release/cancel
  benchmark. Linux GPU utilization samples include the whole device. They sit
  alongside browser timings and preserve the reported RX 9070 XT observation.

## Next — revisit from 00

Refine appearance, movement, controls and explanations one study at a time before
expanding the collection. Keep each accepted technique available for comparison.

### Make the explanation interactive

Turn vertex motion, vector composition, visibility culling, distance detail and
depth into views that can be manipulated in the scene. Show where the mathematics
acts and what changes when a control moves. The existing passages, force colors, wind controls, layer reveals and sample
views provide starting points. Culling, depth and deeper mathematical views
remain to be developed.

### Judge detail in the final image

Compare nearby silhouettes, distant coverage, highlights and their transitions
at fixed camera positions, winds and resolutions. Extend the current rendered
checks to slow camera movement, zoom, different fields of view and pixel ratios:
look for shimmer, blur, disappearing coverage and visible batch boundaries.

Reduce visual detail and computation together, gradually. Measure geometry,
shading, simulation and uploads separately where tools allow it. Keep contact,
source editing, interruption and recovery in the performance scenarios. The
existing benchmark follows interaction at a fixed viewpoint; controlled camera
routes and isolated GPU costs are still to be added.

### Between the blades — deepen each representation

Ground-cover techniques now have permanent, selectable studies, connected to
the [research](research/ground-cover.md):

- **10 · A woven ground:** fine color and normal detail supply a
  continuous surface beneath the existing responsive blades. Reveal the flat
  silhouette and the effect of changing the light and viewing angle.
- **11 · Small shapes, many strands:** short tufts fill the lower layer. Show
  opaque geometry and cutout clusters as distinct representations, including
  their silhouettes, filtering and overlapping pixel work.
- **12 · A little depth everywhere:** shells and fins build shallow turf volume.
  Reveal the layers, their movement and the role of silhouette support.
- **13 · Through the grass:** implicit slices build apparent volume in a fragment
  shader. Expose sampling depth, compositing and the limits at silhouettes.

Each approach is an exhibit in its own right. Preserve all of them; develop the
strongest useful version of each rather than selecting a winner to replace the
others. Explanations, controls, motion and measured cost belong to each study.

Physical objects, the character and the mouse brush contribute contact sources
through one simulation tick. Source transforms and footprints can later be owned
by a physics engine; the grass consumes their shared displacement and recovery.

Share world-space coordinates, path/density masks, wind and contact across the
representations, with gradual transitions in the same landscape. Keep the tall
blades as the common anchor and allow the layers to be revealed individually.
Validate coverage, moving-camera stability, lighting and recovery for each
technique. The initial exhibits and explanatory controls are implemented. Refine
filtering,
crest handling, adaptive shell sampling and moving-camera transitions within each
study; extend the measurements across resolutions and controlled camera routes.

### Compare spatial and wind representations

Use the existing grass grid as the baseline for quadtree and spatial-cluster
experiments. Compare visibility work, submitted geometry, CPU cost and GPU cost
along the same route. Terrain's picking BVH and grass visibility solve different
problems; the grass hierarchy comparison remains open.

Extend the direct-versus-sampled wind comparison to several source counts and
resolutions, including moving-camera performance. Preserve independent origins, addition, reversal,
opposition and contact, and compare both the resulting motion and the cost.

The shared partition can also organize audio. Spatial sources, ambient layers,
playback phase and echo tails still need their own consumer and handoff rules;
audio playback is a future addition. The current rolling storage holds wind
samples; grass geometry remains resident in the finite landscape.

### Continue the research and control refinements

Extend the [historical lineage](research/research.md) through meaningful changes
in algorithms, hardware and the place of grass in the rendering budget. Start
from the games and their landscapes, then narrow by engine and technique as the
field grows.

The [cross-engine research](research/rendering-performance.md) includes Unreal
source and SpeedTree SDK documentation. The standalone SpeedTree SDK source
comparison remains to be added. Aggregate geometry, voxel detail and learned
representations are research directions beyond the current implementation.

Add configurable key bindings and clearer ways to inspect individual winds.
Desktop remains the primary target.

## Further out

- Spatial water accumulation, droplets, splashes and runoff, building on 09’s
  authored wetting and drying.
- Light transport and ray tracing.
- Fluid dynamics, including Navier–Stokes, and neural simulation techniques.
- A capybara and Hamtaro as characters.
- Ocean, atmospheric scattering and richer skies beyond 09’s procedural backdrop.
