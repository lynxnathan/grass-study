# A blade nearby, a field in the distance

A blade of grass is an object when it is close enough to inspect. Far away, a
field is a pattern of coverage, color and movement. Efficient rendering has to
change representation between those scales without making the landscape lose
its volume or revealing where the renderer divided it into batches.

Three decisions work together: what describes a blade, which parts of the field
need work, and how a detailed representation becomes a cheaper one. These ideas
cross engine boundaries. The browser studies provide a place to manipulate them;
the wider field includes native GPU pipelines, production engines and research
representations. Study 08 is an intermediate step on that path.

The companion study [Between the blades](ground-cover.md) examines the missing
short-grass layer: ground shading, small tufts, shells and implicit slices that
can supply continuous cover around the responsive tall blades.

## Represent the blade, then generate its surface

A curved ribbon can be described by its root, direction, width, height and bend.
Its triangles can be shared or generated from those parameters. The important
saving is avoiding a separate stored mesh and a separate scene object for every
blade.

Jahrmann and Wimmer's 2017 method draws individual geometric blades with adaptive
rendering and culling, and evaluates a physical response to gravity, wind and
collisions. Placement can follow arbitrary 3D surfaces. This makes it a useful
reference for separating a blade's simulation state from the geometry chosen to
show it. [Paper and author-hosted draft](https://www.cg.tuwien.ac.at/research/publications/2017/JAHRMANN-2017-RRTG/).

AMD's 2024 mesh-shader example constructs blades from quadratic Bézier curves and
generates a patch in a GPU workgroup. Its distance treatment reduces blade count,
scales the final fractional blade, and widens surviving blades to compensate for
lost coverage. The transferable ideas are compact parameters, shared generation
and gradual coverage changes; mesh-shader work allocation is a separate API and
hardware choice. [Procedural grass rendering](https://gpuopen.com/learn/mesh_shaders/mesh_shaders-procedural_grass_rendering/).

Study 08 now stores 11 floats per blade: root and height, sideways direction and
width, a stable thinning rank, and RGB. That is 44 bytes, compared with the earlier
76-byte transform-matrix-and-color representation. Four topology variants share
those instance buffers. The field contains 305,724 blades, so instance storage
falls from 23,235,024 to 13,451,856 bytes. This is a byte-count reduction; its effect
on frame time depends on what limits rendering.

## Organize the field without printing the organization onto it

A quadtree divides a horizontal region into four children recursively. A grid
provides direct access to regularly spaced cells. A cluster hierarchy follows
object distribution. Each can reject work at a coarse level, then examine a
smaller region when the coarse decision is insufficient. Their practical value
depends on occupancy, camera motion, node layout, batch size and submission cost.

| Reference | Spatial or submission choice | Consequence worth studying |
| --- | --- | --- |
| Unreal HISM, source revision below | Spatially sorted cluster hierarchy; traversal can emit contiguous instance runs | Tighten visibility and LOD decisions without submitting every instance separately |
| SpeedTree SDK 9 | Regular cells, rough and fine culling, newly visible cell populations | Align storage and streaming with visibility work |
| Unity 6 terrain details | Instanced detail meshes with persistent constant buffers | Keep repeated detail data resident instead of rebuilding it every frame |
| Godot MultiMesh | One instanced draw object with collective bounds | Balance fewer submissions against drawing instances outside the view |

In Unreal's inspected HISM implementation, the builder partitions points along
the axis with the largest extent and forms a cluster hierarchy with configurable
branching. Traversal accounts for node bounds, frustum containment, LOD ranges,
optional occlusion results and displacement bounds. It can accept a whole run or
descend to children. This is more specific than calling every spatial hierarchy
a quadtree. The Landscape Grass builder separately supports Halton placement or
a jittered grid, samples terrain height and weights, and builds/reorders instance
data asynchronously. [HISM source](https://github.com/EpicGames/UnrealEngine/blob/396c9f059903aed5fec78ecd3d437a40c6415368/Engine/Source/Runtime/Engine/Private/HierarchicalInstancedStaticMesh.cpp),
[Landscape Grass source](https://github.com/EpicGames/UnrealEngine/blob/396c9f059903aed5fec78ecd3d437a40c6415368/Engine/Source/Runtime/Landscape/Private/LandscapeGrass.cpp).

SpeedTree's SDK 9 documentation describes a cell grid with rough and fine
visibility tests. Instance records match the GPU input layout and include both
a discrete-LOD transition value and an overall detail value. Cells organize
population; transitions describe appearance. A regular grid can therefore support
smooth LOD without changing its spatial structure. [Culling and population structures](https://docs9.speedtree.com/sdk/doku.php?id=culling-and-population-structures).

Unity's terrain-detail documentation describes persistent instancing buffers,
with some additional GPU memory usage. Godot documents the opposite side of
batching's tradeoff: a MultiMesh's visibility is collective, and smaller regional
MultiMeshes can avoid submitting an entire population whenever any part is
visible. [Unity terrain details](https://docs.unity.com/en-us/engine/6000.3/manual/creating-environments/script-terrain/terrain-grass),
[Godot MultiMeshes](https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html).

For this field, the current batches remain a grid. Replacing it with a quadtree
is a separate experiment: compare nodes visited, submitted instances, draw calls,
CPU time and GPU time along the same camera route. A hierarchy pays for itself
when the work it rejects exceeds its traversal and submission overhead. Merely
changing the container would leave an abrupt whole-cell density switch visible.

## Make detail changes continuous

The earlier 07/08 implementation selected one of three meshes from each batch's
center distance and simultaneously changed blade count to 100%, 65% or 35%.
Hysteresis prevented repeated switches at a boundary, but the whole batch still
changed appearance together.

The revised implementation measures distance at each fixed root and scales it
by viewport resolution and field of view as an estimate of projected size.
Curve detail also accounts for blade height. Close ribbons use eight segments,
then morph to four, two and one; small world distance alone does not guarantee
a small screen silhouette. A stable rank
spreads blade removal throughout each batch. Blades narrow smoothly as they leave
the population, while the survivors widen to approximately preserve coverage.
Height and root position stay fixed. No two full grass layers are drawn for a
crossfade.

Curve simplification has its own transition. The quadratic bend gradually
approaches the piecewise-linear shape of the next mesh. The CPU removes redundant
vertices only when even the nearest root in the batch has completed that morph.
Analytical normals remain continuous across the topology change. This costs more
geometry near transition boundaries than switching immediately at a batch center;
it buys a stable landscape. [Implementation](../src/grass-lod.ts),
[rendering and buffers](../src/field.ts).

The same distinction appears in other pipelines. SpeedTree's documented LOD
transition shrinks some elements while changing surviving geometry before moving
to the next discrete mesh. Unreal's traditional HISM path supports dithered LOD
transitions. Morphing, thinning and dithering are different tools; their costs and
artifacts should be shown separately. [SpeedTree transition values](https://docs9.speedtree.com/sdk/doku.php?id=culling-and-population-structures),
[HISM transition handling](https://github.com/EpicGames/UnrealEngine/blob/396c9f059903aed5fec78ecd3d437a40c6415368/Engine/Source/Runtime/Engine/Private/HierarchicalInstancedStaticMesh.cpp).

## When individual triangles stop being the right unit

Sparse ribbons are difficult to simplify as ordinary solid surfaces: removing
them opens holes and thins the field. Nanite's Preserve Area treatment compensates
for lost surface area by expanding the remaining boundaries; grass ribbons become
wider. Epic also describes how overlapping holes weaken occlusion rejection and
increase overdraw. Triangle count alone therefore cannot predict foliage cost.
[Working with Nanite-enabled content](https://dev.epicgames.com/documentation/unreal-engine/working-with-naniteenabled-content).

The experimental Nanite Foliage pipeline in the current Unreal 5.8 documentation
combines instanced assemblies, voxel representations at small projected sizes,
and skinning. Its builder chooses a voxel representation when its simplification
error is lower than the triangle alternative. Runtime voxel clusters have their
own rasterization path and depth ordering. Skinning supplies tighter animated
bounds than unrestricted material displacement. These are useful directions for
later grass studies: preserving the appearance of a moving volume when individual
blades are no longer resolved. [Nanite Foliage](https://dev.epicgames.com/documentation/unreal-engine/nanite-foliage).

Gaussian Frosting explores another representation: a learned layer of Gaussians
around a mesh, with thickness that can capture fine, fuzzy details such as grass.
The representation deforms with its underlying mesh. It offers a comparison for
appearance reconstruction and editing; adapting it to independently controllable
blades and this study's arbitrary spatial wind sources would require additional work.
[Guédon and Lepetit, arXiv:2403.14554](https://arxiv.org/abs/2403.14554).

Neither representation is implemented in 08. They belong in the path beyond
individual ribbons, alongside their training/build costs, animation constraints,
lighting behavior and temporal stability.

## A field can already rotate

Study 08 composes N sources with independent origins. A directional source gives
nearby blades a common heading with traveling gust modulation. Radial and vortex
sources instead use the offset from their own origin. With normalized offset
`u = (root - origin) / radius`, the vortex direction is `(-u.z, u.x)`. Its envelope
is proportional to `max(0, 1 - dot(u, u))²`, multiplied by strength and gusts.
The center is finite and the outer boundary fades smoothly. Reversing the sign
reverses circulation. These fields superpose before the blade bends or receives
its response color.

This introduces spatial variation and circulation without waiting for a fluid
solver. Conservation, transport and pressure belong to the later Navier–Stokes
study; wetness and light transport have their own later questions.

## Follow the bytes and the repeated work

Three distinct costs need separate measurements:

- **Resident data and GPU fetches.** Compact instance records reduce storage and
  the input data available to fetch. Cache reuse and actual bandwidth savings
  require GPU profiling; a byte count does not establish an L1/L2 bottleneck.
- **CPU-to-GPU transfers.** Static blade attributes upload on creation. In the
  current field they do not stream across PCIe every frame. The contact texture
  changes during interaction; wind-source parameters upload when controls change.
- **Repeated shader evaluation.** Direct wind repeats root-level work across a
  ribbon's vertices and scales with source count. Study 08 now offers a blend into
  a sampled broad-flow field farther away. Sampling adds a pass, texture traffic
  and interpolation error; small spatial sources remain direct. The two paths
  can be compared with **Blend wind detail**.

SpeedTree's earlier SDK streaming documentation explicitly discusses busy instance
buffers and double buffering to reduce waits. It also describes cases where
submitting candidates and suppressing them in the shader beat constructing an
exact visible list on the CPU. That is a useful comparison, rather than a universal
rule that fewer submitted instances always wins. [Population streaming and culling](https://docs.speedtree.com/doku.php?id=outline).

The implemented wind cache shares grass's 12-meter patch coordinates. Two
266 × 266 RGBA16F targets provide modulo-addressed working windows, including
boundary and guard samples. A window move blends the outgoing and incoming
results over 300 ms while both advance at the same wind time. The contact texture
is independent of these storage slots, so slot reuse does not erase a wake.
This reuses wind storage within the finite scene; grass instance buffers remain
resident. [Patch addressing](../src/patch-grid.ts),
[wind handoff](../src/wind-patches.ts).

For study 08, measure the crossover between direct N-source wind evaluation and a
field texture at several source counts and field resolutions. Keep camera,
coverage, contact and wind patterns fixed; compare both timing and vector error.
Then compare a grid, quadtree and spatial cluster layout under identical visibility
conditions. The presentation can expose the nodes, rejected batches and sampled
vectors, so the savings have a visible explanation.

## References and versions

The Unreal source comparison uses revision
`396c9f059903aed5fec78ecd3d437a40c6415368`; its `Build.version` reports 5.8.3.
The examined files are HISM, Landscape Grass and `SpeedTreeCommon.ush`. The latter
is Unreal's integration shader, not an inspection of the standalone SpeedTree
SDK implementation. SpeedTree findings above use the named SDK documentation;
the standalone SDK source comparison remains to be added. Unreal source links
require an Epic-linked GitHub account.

The Unity reference is the 6000.3 manual. Godot's stable page currently identifies
4.7 and flags its documentation as awaiting review for that version. AMD's example
is from March 2024; the two academic references are from 2017 and 2024. The Nanite
Foliage feature is explicitly experimental. These references describe distinct
pipelines, rather than interchangeable performance results.
