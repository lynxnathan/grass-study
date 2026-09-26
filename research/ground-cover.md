# Between the blades

A meadow needs both individual blades and a continuous body of grass. The tall
blades give it recognizable shapes, silhouettes and movement. Shorter growth
fills the space around their roots. Rendering these two scales differently can
make the field feel denser without giving every fine strand a separate mesh.

The interesting comparison is how much convincing ground cover each technique
can produce for its cost, especially while the camera moves and the grass bends.

## What is missing in the current field?

Studies 05–09 turn each seeded tuft into twelve ribbons, scattered within a
1.2-metre square. Their heights range from 0.45 to 1 metre. In 07–09, a nearby
width multiplier narrows their 6.5–14 cm base widths to about 2.6–5.6 cm before
the blade profile tapers them. The result is many distinct, responsive stems,
with gaps between clumps. [Blade construction and shader](../src/field.ts).

Underneath, the terrain has vertex colors and broad color variation. It has no
fine grass texture, normal detail or short turf layer. Those gaps therefore show
an almost featureless surface. Increasing tall-blade count could reduce them,
but the missing scale is shorter growth close to the ground.
[Terrain](../src/terrain.ts), [tuft placement](../src/grass.ts).

Distance thinning already widens surviving blades, following the same general
coverage-compensation idea illustrated in AMD's procedural grass example. This
helps a thinning population retain its apparent mass; it does not guarantee
continuous cover between clustered roots.
[Current LOD](../src/grass-lod.ts),
[AMD: procedural grass rendering](https://gpuopen.com/learn/mesh_shaders/mesh_shaders-procedural_grass_rendering/).

## Four ways to supply the smaller scale

| Representation | What supplies the impression of grass | Main cost or weakness to compare |
| --- | --- | --- |
| Ground material | Fine color, normals and roughness suggest many tiny blades | Texture and shading work; the surface still has no raised silhouette |
| Short tufts | Small geometric clusters or cutout cards rise between tall blades | Geometry for individual strands; overlapping and discarded pixels for cards |
| Shallow shells with fins | Stacked textured surfaces sample a short volume; upright slices support its edges | Repeated pixel work; exposed layers at shallow viewing angles |
| Implicit slices | A fragment shader searches and combines textured slices inside a grass volume | Samples per pixel, depth integration and silhouette limitations |

A textured ground is a useful common foundation for all three raised
representations. Matching color alone is insufficient: a smooth ground normal
and a shiny blade can reveal the transition as the light or camera turns.
DKNazar's *Rendering Fine Grass* describes blending grass and ground material
properties with distance and viewing angle. Its implementation uses instanced
cards, stable world-grid placement and a depth prepass. The author's remaining
shader-cost concerns also make it a useful reminder to measure texture work,
not just polygon count.
[Implementation notes and code](https://dknazar.github.io/fine-grass/).

### Short tufts: put several strands in one shape

A card can depict many blades while its vertices bend as a group. Crossed cards
keep that group visible from more directions. Pelzer's *GPU Gems* chapter
explains this construction and compares movement at several grouping scales.
[Rendering Countless Blades of Waving Grass](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass).

For this scene, a short population could fill gaps independently of the tall
clumps. Compare compact opaque tufts against tightly cropped cutout cards:
fewer vertices can still mean more expensive pixels. Use a shared density mask
and a stratified or minimum-spacing distribution so additional roots fill space
instead of repeatedly landing in existing clusters. Keep broad irregularity in
the density mask so the meadow retains natural variation.

### Shells and fins: give the ground a shallow volume

Lengyel, Praun, Finkelstein and Hoppe's 2001 fur method samples a strand volume
into layers around a surface. Fins extend outward near silhouettes, where
surface-parallel layers become visibly separated. Local shearing can animate
the volume. The same construction is relevant to short grass.
[Author page and paper](https://hhoppe.com/proj/fur/).

Bakay, Lalonde and Heidrich's *Real Time Animated Grass* (2002) applies shells to
terrain. A texture's alpha stores blade heights; successive layers retain fewer
cross-sections. Vertex displacement follows a spatial wind field. Their
measurements expose a fill-rate bottleneck, and the paper discusses custom
mipmaps and density compensation when shell count decreases.
[Paper](https://www.cs.ubc.ca/labs/imager/tr/2002/bakay2002a/bakay.2002a.pdf).

A candidate here is a shallow turf volume below the existing tall blades, with
short geometry supporting crests and low views. Moving the layers according to
height could reveal brushing and gusts through the whole cover. This represents
collective bending; individual fine strands would not each have simulated state.
Strong bends, hills and paths must be inspected for sliding roots, exposed slices
and mismatches between shells and their supporting geometry.

### Implicit slices: spend work where the grass occupies the image

Habel, Wimmer and Jeschke's *Instant Animated Grass* (2007) composites implicitly
defined grass slices from front to back in a fragment shader. Its published HLSL
walks a grid of slice intersections and samples wind while accumulating color
and opacity. This creates apparent depth without submitting every slice as a
mesh. It is richer than a single displaced height surface, but the paper
identifies silhouettes and entering the grass volume as limitations.
[Paper and accompanying implementation](https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_IAG/).

This deserves a separate short-turf comparison with bounded sampling and explicit
geometry at exposed edges. A dense screen can still make it expensive. Contact,
wind and depth must agree with the rest of the scene; a displaced image painted
onto unchanged ground depth can intersect feet and rain incorrectly.

## Coverage has to survive filtering

A card's mipmaps must retain its apparent occupied area as details become smaller
than a pixel. Ordinary alpha averaging followed by a fixed cutoff can make the
cover disappear. Color padding around cutouts also matters: filtering background
colors into their edges creates halos.
[Adam Sawicki: alpha-test cutout filtering](https://asawicki.info/articles/alpha_test.php5).

Hashed alpha testing replaces the fixed cutoff with a spatially varying threshold
to preserve coverage under minification. Its tradeoff includes noise; it is a
candidate to compare against coverage-preserving mipmaps and multisample
alpha-to-coverage, not an automatic quality upgrade.
[Wyman and McGuire: Hashed Alpha Testing](https://research.nvidia.com/labs/rtr/publication/wyman2017hashed/).

Transitions should follow projected detail and viewing angle. In this study,
tall-blade height should remain stable while the finer layer gradually gives way
to filtered surface appearance. Carry broad color, roughness and wind motion
through that handoff. Reducing layers, samples and shading detail must accompany
the visual fade; otherwise the expensive representation remains underneath an
apparently simpler image.

## One field, several ways to draw it

All candidate layers should share world-space coordinates, terrain height, path
and density masks, and the existing wind/contact fields. Each renderer can sample
those fields at its own useful resolution. The short layer needs its own bend
response, but a vortex must have the same origin and direction throughout the
field. Contact recovery must continue across a representation change.

Unifying the mask matters even before adding detail. Current tuft rejection and
terrain path coloring use different edge rules, and the ribbon roots are jittered
after tuft placement. A shared occupancy field would let the ground, short turf
and tall stems describe the same path instead of independently guessing its edge.
[Placement](../src/grass.ts), [ribbons](../src/field.ts), [path shading](../src/terrain.ts).

For the gallery, an explanatory reveal could separate the ground material,
short cover and tall blades, then bring them together. A coverage view could
show which representation supplies each visible region. The visitor could brush
across a transition and see the same disturbance continue through it.

## The exhibits

Give the ground material, short tufts, shells with fins and implicit slices their
own selectable studies. Retain the current tall blades as a common anchor. Each
representation has something different to teach about coverage, movement, depth
and cost; each remains part of the gallery as its implementation develops.
Comparisons make those differences visible rather than selecting one technique
to replace the others.

Use the same landscape, camera, lighting, wind and target coverage for each:

- Inspect fixed high, walking-height and grazing views, including hill crests,
  path edges and the space around the character. Start with rain off so rain
  pixels cannot conceal gaps or inflate a coverage measurement.
- Move slowly, orbit and zoom at multiple fields of view and pixel ratios.
  Look for shimmer, sliding texture, exposed layers and fading seams.
- Apply opposing winds, a localized vortex, brushing and release. Follow motion
  and recovery across patch boundaries and representation handoffs.
- Compare dry and wet materials in daylight and at night. Normal, roughness and
  depth differences can expose a transition that color matching conceals.
- Render separate masks for raised grass and its ground foundation, excluding
  the intended path and sky. Measure exposed ground within the intended grass
  area; keep final-color captures alongside them to judge whether the result
  actually reads as grass.
- Toggle each layer independently and measure GPU frame time, submitted geometry,
  draw calls, memory and uploads at matched visual coverage. A depth prepass is
  another measured variant: its extra draw and alpha work must earn their cost.

An occupancy mask cannot judge beauty or replace inspection in motion. It can
catch disappearing cover while the image comparisons expose blur, aliasing and
material mismatch. Device utilization remains useful alongside frame timings;
the measurement scope and current results live in [Performance](../docs/PERFORMANCE.md).

## Toward aggregate representations

At smaller projected scales, modern renderers can preserve groups of strands
as aggregates rather than thinning individual triangles indefinitely. Epic's
experimental Nanite Foliage documentation describes triangle-to-voxel rendering,
assemblies and skinning. That is a useful later comparison for preserving mass,
material and movement across representations; its native pipeline is a separate
implementation from this WebGL scene.
[Nanite Foliage](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-foliage).

The next useful step is the visible one: make the space between the responsive
blades feel alive, then reveal how each layer earns its place in the image.

## In the gallery

Studies 10–13 now expose the surface foundation, solid/cutout tufts, shells with
fins, and implicit slices as separate exhibits. Layer controls reveal the
construction, and placed stones join character and brush contact through the
same simulation tick. [Study guide](../docs/STUDIES.md).

The implicit implementation traverses horizontal samples in a local tangent
volume shared with the shell study. Habel's crossed-grid traversal remains a
further variant to explore. Adaptive shell sampling, stronger crest handling,
coverage-preserving asset filtering and broader performance routes remain useful
refinements of these exhibits.
