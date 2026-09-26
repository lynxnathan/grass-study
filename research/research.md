# Grass, from a surface to a field

Grass changes how a landscape feels at walking height. It breaks up the ground,
catches the light, moves with the wind, and responds to a body passing through.
This research follows the technical jumps that build that impression: changes
in algorithms, in the resources devoted to grass, and in the hardware available
to render and animate it.

The reference is grass to walk on or through: short turf, tall capim, dry
meadows, wet blades and frosted ground. Realism guides the study, with attention
to the shape, material and behavior of grass at human scale.

## 01. Lineage — what makes the next field possible?

The route into this history is through 3D games themselves: flight simulators,
racers, adventures and the other worlds that appeared on personal computers.
Their release chronology traces different ways of representing the ground,
including scenes where grass is absent. As the number of games grows, engines and rendering
techniques become useful ways to follow related developments.

Each comparison connects three things: what the technique does, how much grass
matters to the scene and play relative to its cost in the whole pipeline, and
what the hardware can support. A field might gain density through a more efficient
algorithm, a larger share of the frame budget, or greater processing capacity.
Understanding that combination is the thread through these examples.

A grass texture gives the ground its surface; raised tufts give it a silhouette.
A field brings questions of density and distance. Wind and contact give it
behavior. Each changes how the scene looks and feels to walk through.

### 1990 — looking at the ground

Two games from 1990 offer a first visual comparison. In the DOS racing game
**Stunts**, the inspected driving views show a flat green surface beside the
track, with no visible blades or tufts. In the DOS image of **Alpha Waves**, the
floor belongs to an abstract room filled with geometric platforms; no grass is
visible in that scene. These views provide a comparison for what later
grass adds to the ground: texture, silhouette and height.
[Stunts release history][stunts-history], [driving view][stunts-view],
[Alpha Waves image][alpha-view].

Christophe de Dinechin's account of making *Alpha Waves* follows the construction
of a world from cubes to platforms and movement. It is a useful companion to
the image, showing how these early worlds made space and movement readable.
[The creator's account, translated by MO5][alpha-history].

### 1999 — moving through grass

In **Delta Force 2 (1999)**, tall grass matters to the player's movement and
visibility: players can crawl through it to approach enemies unseen. NovaLogic
described this feature in its April 1999 announcement, and it remains part of the
publisher's description of the game.
[NovaLogic announcement][df2-announcement], [game description][df2-store].

A field can change a player's route, encourage crouching, and obscure the view.
Grass becomes part of play as well as part of the image. How does the field read
from inside it?
[Game description][df2-store].

### 2002–2004 — building a meadow from a few polygons

The **Codecreatures benchmark (2002)** demonstrated dense grass moving in changing
wind. In **GPU Gems (2004)**, Kurt Pelzer explained an approach based on that
work: put several blades into a texture, arrange textured quads so they cross,
and animate their upper vertices while keeping the roots in place.
[Rendering Countless Blades of Waving Grass][pelzer].

Crossed cards address a weakness of a single fixed plane: it almost disappears
when viewed edge-on. Pelzer also compares animation by cluster, vertex and tuft,
showing how draw calls, distortion and variation affect the result. This makes
the chapter a useful companion to the grass-card studies.
[Chapter 7, sections 7.3–7.4][pelzer].

### 2007 — making the shading affordable

Tiago Sousa's account of **Crysis** development shows how the cost of drawing
a field shapes its appearance. Grass uses per-vertex shading and alpha blending;
Sousa identifies fill rate as a reason to keep its shading inexpensive.
[Vegetation Procedural Animation and Shading in Crysis, section 16.2][sousa].

That raises a question for the performance HUD: how much of the frame's work
comes from the field, and what appearance does that expenditure buy? Triangle
count is one part of the comparison. The cost of shading overlapping grass also
deserves attention alongside the work of rendering the rest of the scene.

### 2021 — a developer's view of individual blades and gusts

In his GDC presentation abstract, Sucker Punch's Eric Wohllaib describes
**Ghost of Tsushima** fields built from individual grass blades generated on
the GPU, with procedural appearance and animation.
[Procedural Grass in Ghost of Tsushima, GDC 2021][ghost-gdc].

Matt Vainio's accompanying developer article describes gusts at two scales:
a broad moving noise pattern and finer detail passing over the grass. It also
explains how character and horse movement displaces grass, with a damped response
that lets it settle back. These accounts connect the blade, the field and the
body moving through it: three scales of grass interaction.
[How stunning visual effects bring Ghost of Tsushima to life][ghost-vfx].

### A parallel thread: grass as an interaction

In Nintendo's retrospective on **Ocarina of Time**, Shigeru Miyamoto discusses
bringing grass-cutting into the original Nintendo 64 game. It offers another
way to think about contact: cutting changes the grass and rewards an action.
Alongside walking through a field, cutting adds another form of interaction.
[Nintendo's conversation with Miyamoto][zelda].

## Bringing the research into the field

The [first grass study](../docs/STUDIES.md#01--the-first-blades) uses one upright,
camera-facing cutout per tuft. The same character and hilly landscape stay in
place as the technique changes, keeping the comparison at walking height.
The side arrows return to the bare terrain or move on to the next technique.

The playable sequence compares single cards with crossed cards, then adds sway,
layered gusts, curved blades, contact and distance detail. Moving through the same
scene makes differences in silhouette, root attachment, repetition and density
easier to see. Study 09 adds rain, gradual wetting and drying, and a changing
sky: roughness and a reflective coating shift the focus from forces to the
surface’s response to light. See the [rain study](../docs/STUDIES.md#09--when-the-rain-arrives)
for its material references and approximations. Height and frost offer further
variations in appearance and response.

Each iteration pairs a visual or interactive change with its cost in the same
scene. Density and distance can vary within a technique; changing the technique
then gives another comparison. Historical hardware gives those choices context.
Live measurements describe their behavior on the machine running the study.

## Reading

- [NovaLogic's Delta Force 2 announcement][df2-announcement] — contemporary
  description of using tall grass for concealment, reproduced by Tweakers in 1999.
- [Kurt Pelzer, GPU Gems, chapter 7][pelzer] — grass cards and wind animation,
  published in 2004, drawing on the 2002 Codecreatures benchmark.
- [Tiago Sousa, GPU Gems 3, chapter 16][sousa] — Crytek's 2007 development account;
  section 16.2 discusses grass shading specifically.
- [Eric Wohllaib, GDC 2021][ghost-gdc] — overview of procedural grass generation
  for Ghost of Tsushima.
- [Matt Vainio, PlayStation Blog, January 2021][ghost-vfx] — gusts, displacement
  and recovery in Ghost of Tsushima.
- [Miyamoto and Iwata's Nintendo interview][zelda] — the transition of grass-cutting
  into a 3D game.

[stunts-history]: https://www.mobygames.com/game/329/stunts/?s=date
[stunts-view]: https://www.bestoldgames.net/img/games/stunts/stunts-03.webp
[alpha-view]: https://mag.mo5.com/wp-content/uploads/2019/07/alpha-waves.png
[alpha-history]: https://mag.mo5.com/167867/chronique-la-genese-dalpha-waves/
[df2-announcement]: https://tweakers.net/nieuws/2157/delta-force-2-aankondiging.html
[df2-store]: https://store.steampowered.com/app/32630/Delta_Force_2/?cc=uk&l=swedish
[pelzer]: https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass
[sousa]: https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
[ghost-gdc]: https://www.gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass
[ghost-vfx]: https://blog.playstation.com/2021/01/12/how-stunning-visual-effects-bring-ghost-of-tsushima-to-life/
[zelda]: https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-The-Legend-of-Zelda-Ocarina-of-Time-3D/Vol-5-Mr-Shigeru-Miyamoto/4-The-Enjoyment-of-Turning-2D-to-3D/4-The-Enjoyment-of-Turning-2D-to-3D-224714.html

## Rendering across engines

[A blade nearby, a field in the distance](rendering-performance.md) examines
representation, spatial organization, continuous LOD and data movement, connecting
the current ribbon studies to later production and research techniques.
