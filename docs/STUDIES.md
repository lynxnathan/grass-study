# Studies

Each step opens a short passage about what to notice. Let the letters arrive, or
choose **Show all** to read immediately. **Into the field** closes the passage;
**Read** brings it back. **Under the surface** opens the technical note. The scene
continues throughout, and only the grass fades when the study changes.

Share a study with `?s=8` in the URL. Switching studies updates the link; opening
the page without a study number starts at 00.

Fourteen techniques in the same landscape. Press **0–9** to jump
to studies 00–09, or **H / L** for previous / next through the full sequence. The arrows at the edges of
the screen and **Page Down / Page Up** also move between studies. Start on
bare ground; each transition fades only the grass out and back in with the next
technique. Terrain, character and interface stay visible. Position and camera
carry across the transition, while the field keeps moving. Studies 09–13 share gradual weather and lighting. Earlier studies recover their
original conditions. A direct visit to 10–13 begins without falling rain.

The sequence follows changes in shape, motion, interaction and rendering cost,
implemented with current tools. Game references give context to those techniques.

| Study | Technique | Look for |
| --- | --- | --- |
| 00 — The ground beneath | Bare terrain | Surface, scale and the path through the hills. |
| 01 — The first blades | Camera-facing cutouts | How little geometry can suggest a tuft. |
| 02 — A little volume | Two crossed cards | A silhouette that survives walking around it. |
| 03 — The first breath | A shared oscillation | Anchored roots and a recognizable repeating rhythm. |
| 04 — Winds, plural | Traveling noise at two scales | Broad gusts interrupted by a smaller crosswind. |
| 05 — Every blade a shape | Curved, tapered geometry | Blade silhouettes and light moving over their surfaces. |
| 06 — Leave a wake | Contact with spring recovery | Grass yielding and settling after a body passes. |
| 07 — A field in motion | Denser blades with distance detail | Nearby shape, distant coverage, gusts and contact together. |
| 08 — Where winds meet | An editable collection of vectors | Independent origins, rotating flow, winds reinforcing and opposing one another. |
| 09 — When the rain arrives | Wet surfaces and changing light | Reflections, drying after rain and a continuous passage into night. |
| 10 — A woven ground | Surface color and normal detail | Fine growth suggested on a flat silhouette. |
| 11 — Small shapes, many strands | Solid tufts and crossed cutouts | Different ways to supply the same smaller scale. |
| 12 — A little depth everywhere | Shells and fins | A shallow volume assembled from visible slices. |
| 13 — Through the grass | Implicit volume slices | Samples inside a pixel, early exits and reconstructed depth. |

## 01 — The first blades

One upright camera-facing quad per tuft, two triangles and a shared procedural
alpha-cutout texture. Seeded placement covers the hills while leaving the path
open; roots use the same triangle-exact terrain height as the character.
Switch to study 00 to compare the bare terrain from the same viewpoint.

The cards use instancing for one extra draw call. Color and blade shading are
painted into the texture. Grass receives fog, but does not cast or receive shadows.
Look down from above and orbit a tuft to see its flatness and camera-following
rotation.

## 02–04 — Volume, rhythm, gusts

Crossed cards keep the original tuft locations and texture while using two planes
per tuft. They stay oriented in the world, with four triangles per instance and
more overlapping pixels to draw.

The sway study moves their upper vertices with one sinusoidal rhythm. The next
study replaces that shared rhythm with two traveling noise fields: a broad flow
and a smaller flow crossing it. Vertex displacement
increases toward the top of each card, leaving the root in place.

[Kurt Pelzer's GPU Gems chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass)
is a companion for crossed grass cards and approaches to animating them.

## 05–06 — Shape and contact

Individual blades use tapered ribbons with four segments, seven triangles and a
curved centerline. The GPU adds wind and contact displacement to that curve and
updates its surface normal for lighting. Root-to-tip color, directional light and
received scene shadows give the blades depth. Grass does not cast its own shadows.

The character and left mouse brush push a shared 256 × 256 displacement field.
Each active cell has displacement and velocity; a damped spring brings it back
toward rest. The CPU integrates those cells, and the vertex shader samples the
field to bend the blades. This gives nearby blades a coherent response at a lower
cost than simulating each blade separately. Roots remain fixed.

In study 06, reacting blades shift from green through cyan to blue as the local
displacement grows. A bright cyan outline traces each blade's edges, making the
affected blades easy to pick out against the field. Color and outline fade as the
spring returns toward rest. Both read the magnitude of the same contact vector
used to bend the grass, so your passing wake and the mouse brush reveal their
reach. The edge highlight follows the blade's tapered shape within its existing
surface and uses a little emission to stay readable in shadow.

Hold **left mouse** over the field to brush it. **Right mouse** still controls the
camera. Wind and spring recovery continue while you explore or change studies.

## 07 — A field in motion

Study 07 brings together curved blades, layered gusts and contact in a
denser field inspired by **Ghost of Tsushima**. Sucker Punch's developer account
connects procedural grass, gusts at different scales, and displacement with damped
recovery. [Matt Vainio's account](https://blog.playstation.com/2021/01/12/how-stunning-visual-effects-bring-ghost-of-tsushima-to-life/).

With wind highlights enabled, the blue gradient and cyan outline reveal the
combined wind and contact displacement. Orange marks the contact contribution
from your body or brush, so it stays recognizable where it meets a gust. The shader reads the same vectors
for bending and color. Your wake can reinforce or oppose the wind; orange identifies
contact rather than assigning a sign to vector length. Study 06 keeps showing
contact alone in blue. The blade's resting curl is excluded from the color signal.

The field is divided into batches with shared blade geometry. Each blade uses its
own projected size to narrow gradually out of the population; the
survivors widen to keep distant coverage. Viewport resolution and field of view
scale the distance thresholds, and taller blades retain their curves farther away.
Close ribbons have eight segments and a slimmer silhouette. Width gradually
broadens in the distance to retain the field’s coverage. Curves morph toward a simpler shape
before a batch changes from fifteen triangles per blade to seven, three, then one. The
nearest root bounds decide when removing those vertices is safe. This keeps the
batch boundaries out of the landscape. Compact instance records stay on the GPU;
visibility bounds include the current wind collection and contact displacement.

**Force view** makes the response visible across the moving representations,
including wet blades, the surface weave, short tufts, shells and implicit turf.
Press **Tab** while the scene has focus to fade the colors in or out over 450 ms.
The wind, contact and bending continue throughout. **Shift+Tab** enters the toolbar;
Tab inside the interface keeps its normal navigation role.

**V / Wind highlights** and **B / Contact tint**, also inside **Winds**, filter
this view independently. Contact alone appears blue; where wind already colors
the grass blue, contact shades toward orange. The choices carry between studies,
even while the view is hidden. Study 06 retains its contact-only explanation and
07 its combined-vector response. The static studies have no force response to color.

The palette and fades are shared presentation code. Each study keeps its existing
force sampling, bend and contact recovery. Shell slices use the shared color fill;
their construction edges do not masquerade as blade outlines. Separating shells
or showing sample visits retains those explanations’ own color meanings.

The edge highlight fades when the ribbon becomes too narrow on screen. As distance
increases, the outline recedes first and the force tint follows, returning the
far field to its natural colors. Both use the viewport/FOV scale. Once all roots
in a batch have finished a fade, a simpler shader omits the corresponding work.
This keeps dense distant highlights from overwhelming the final image.

This spends more geometry where a blade can be seen and less where the field reads
as a mass. The Stats overlay measures the whole scene, including shadow passes.
Its sampling window restarts when the technique changes so measurements from two
studies are not mixed. Software WebGL test results verify behavior, not hardware
performance.

## 08 — Where winds meet

Open **Winds** to shape the field. Expand a source’s row to edit it; fold it away
to keep its direction or flow type and strength in view. New sources open for
editing, and folding a row preserves its settings.

In 08, **Add wind** and **Add vortex** start each
new source with a different heading, strength, origin, reach and gust pattern.
Origins are distributed across the field, independently of the character and camera. Existing sources keep their settings.
**Reset winds** restores the two starting flows.

Two directional sources are the starting point:
add more, remove them, reverse a direction, or aim one against the first. Heading
rotates a flow across the ground; strength scales it. Each carries a traveling
gust. The basic controls are also available from study 04 onward.

In 08, each source has an independent origin. Choose **From a point** for a radial
flow, or **Around a point** for a vortex. **Add vortex** creates a rotating flow
directly. Move its origin with **Place on ground**, then click the terrain, or edit
its X/Z coordinates. **Reach** controls the affected radius; **Reverse** changes
outward flow to inward flow, or reverses the rotation. Press **Escape** to cancel
placement. The next normal left press brushes the grass again.

A vortex assigns a tangent vector around its center. Its magnitude grows from
zero at the center and fades smoothly at the boundary. Several vortices can sit
at different positions and combine with directional or radial flows. Every blade
samples the sum at its own root: N sources define a spatially varying field.
This is an authored vector field; fluid dynamics is a later study.

The field stays green in gentle wind, shading into blue as the combined winds
bend it more strongly. The cyan edges grow with that response, letting gusts
stand out against the quieter grass. Contact from your body or brush turns green
grass blue; where wind already colors the grass blue, contact shades toward orange
to keep the two contributions visible.

The collection has a variable size. Three texture pixels store each source's
direction, strength, gust parameters, origin, reach and flow type. Near blades
sum those sources directly. With **Blend wind detail** enabled, distant blades
instead sample broad flow from a field computed once per frame. The transition
mixes both representations gradually. Small vortices and radial flows retain
direct evaluation so interpolation does not flatten their shape.

Grass and wind use the same 12-meter spatial partition. Wind samples occupy a
rolling window of reusable slots. Modulo addresses the slots; world coordinates
identify the patch. Each tile has matching boundary samples and a guard border,
so interpolation cannot read from an unrelated neighbor in storage.

When the window moves, the outgoing and incoming windows overlap for 300 ms.
Both evaluate the same source collection at the same simulation time. Wind phase
continues, and the shared contact field keeps its displacement and recovery.
Rapid movement finishes the current blend before taking up the latest window.
At the working set's edges, sampling blends back into direct evaluation.

Turn **Blend wind detail** off to compare direct evaluation everywhere; the switch
also fades. Adding sources changes the work in the direct shader and sampled-field
pass. With no sources, wind displacement is zero and contact still works. The Stats
overlay includes the sampling pass: one extra draw normally, two during a window
handoff. Browsers without floating-point render targets use direct evaluation.

## 09 — When the rain arrives

Open **Weather** and follow the sheen along the path. More rain gradually wets the
surface. **Stop rain** clears the falling streaks first; the ground and blades
take longer to dry. Move **Day into night** slowly, or change your mind halfway:
the sky, fog and lighting follow continuously. Walking, brushing and all the
spatial winds remain available. Force colors stay in the earlier studies so the
surface can show its own response to light.

Open **Follow the light** to change roughness. A smoother surface concentrates
reflected light into a narrower highlight; a rougher surface spreads it. The
material combines a darkening base with a reflective coating. The two changes
produce different cues: color describes the surface, while the highlight moves
with the viewing and lighting directions.

Water can change both reflection at a surface and scattering within a porous
material. Sébastien Lagarde’s [wet-surface study](https://seblagarde.wordpress.com/2013/03/19/water-drop-3a-physically-based-wet-surfaces/)
examines those mechanisms and why different materials respond differently.
Here, wetness is a single authored value approaching saturation while rain falls
and decaying afterward. The coefficients make the change legible over seconds;
spatial accumulation, infiltration and runoff are future experiments.

The surface uses [Three.js’s physical material](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
with roughness and clearcoat. Clearcoat is an approximation of the wet layer:
its fixed 4% normal-incidence reflection corresponds to an index of refraction
of 1.5, rather than water’s approximately 1.33. Ground, rocks and grass have
separate darkening and roughness responses. A broad procedural sky reflection is
[prefiltered](https://threejs.org/docs/pages/PMREMGenerator.html) once on the first
visit to 09; its intensity follows the weather. It contains no reflections of
the character, moving clouds or nearby scenery.

Rain is one instanced draw with fixed seeds in a repeating world-space volume.
A 48-meter window reuses the particle budget around the view. Drops stay fixed
in world space until they wrap beyond the fade distance; walking does not drag
the rain along. Each streak samples the existing spatial winds at its location.
Their width accounts for display pixel density so high-DPI scaling preserves
their visible body. A height texture
uses the same triangular interpolation as the ground; streaks fade as they reach
it. Rainfall changes visible density gradually. This is a visual particle effect;
individual droplets do not collide with the character or rocks, and there are
no splashes yet.

The sky blends authored horizon and zenith colors, procedural cloud noise and a
sparse star pattern. It follows the camera without moving the landscape. Fog
shares the horizon color, and the light direction, strength and color change
alongside it. This is a controllable lighting backdrop; atmospheric scattering
and detailed light transport have their own work ahead.

Earlier studies remain available for comparison. The [roadmap](../ROADMAP.md)
tracks their refinements alongside dripping, fluid simulation and light transport.

## 10–13 — Between the blades

The tall blades remain the common anchor. Each step adds a different way to
supply the smaller growth around their roots. Open **Layers** to reveal the
foundation, tall blades and short cover individually. The techniques stay
selectable; their differences are the subject of the studies.

**10** adds a world-space weave of color and fine normal variation to the ground.
Its pattern stays attached to the landscape. Hiding the tall blades exposes its
limit: the hill's silhouette remains the original terrain.

**11** places deterministic short tufts in the same landscape. **Solid blades**
use nine small ribbons per tuft; **Painted clusters** use two crossed cards.
They share roots, the path mask and the existing wind/contact field. The cards
use multisample alpha coverage; their filtered texture represents many strands.
Fewer triangles can still require more overlapping pixel work.

**12** samples a shallow strand volume with 4–24 terrain-following shells.
**Separate the slices** enlarges their spacing and colors their heights to reveal
the construction. Fins are upright cross-sections, blended in at shallow angles.
Their texture samples the same volume. Raising the layer count improves sampling
while drawing more overlapping surfaces. A height texture describes tapered
cross-sections; these fine strands have collective motion, not separate springs.

**13** searches that volume inside the fragment shader. Its bounded traversal
uses horizontal slices through a local tangent-plane approximation of the terrain,
accumulates color and stops when the view is almost opaque. It reconstructs depth
from a substantial hit, falling back to the local base surface. **Show samples
visited** maps fewer samples to blue and more to orange; the maximum budget is 48.
Explicit texture LOD keeps filtering defined when adjacent rays exit at different
iterations. This implementation shares 12's volume; it does not reproduce the
crossed-grid traversal in Habel's original *Instant Animated Grass* shader.

The implicit surface has real limits at crests, near-horizontal views and terrain
curvature within the traversal. Its grazing-angle appearance blends toward the
foundation. Shells expose their slices at those angles instead. Looking closely
at these differences is part of the studies. The [research](../research/ground-cover.md)
connects the constructions to their papers and implementations.

Short detail fades with projected distance into the ground foundation. Patch
bounds reject representations outside their working range. Implicit sampling
also reduces its budget with distance; shell count remains an explicit control.
The independent tall-blade LOD retains its existing silhouette behavior.

### A shared contact tick

Open **Objects can touch it too**, choose **Place a stone**, then click the ground.
Escape cancels placement. **Remove stones** releases their contribution and the
grass recovers. Placed objects persist when changing studies.

Character, brush and object sources enter the same bounded simulation step.
Each source supplies an identity, position, radius and impulse rate. A later
physics engine can own those transforms and contact footprints; the renderer
continues to consume the resulting displacement texture. The current footprint
is an XZ disc applied at ground contact. Placed stones are stationary, and the
character does not collide with them.
