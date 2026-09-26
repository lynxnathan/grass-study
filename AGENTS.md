# Grass study — working agreement

## Purpose and presentation

- This is an interactive art study of grass, rendering and simulation. Experiments
  can grow, branch and be revisited. Keep the focus on the techniques and their
  visible effects.
- The horizon belongs to the gallery’s artistic scope. Study 09 now includes
  a gradual procedural sky transition; deeper sky and ocean studies remain ahead.
- Explanation is part of the work. Care for visitors with different backgrounds:
  let them experience an effect, manipulate it, and discover how it works at their
  own pace. Keep the scene inviting even when they choose not to open an explanation.
- Nathan's presentation references are Bartosz Ciechanowski (https://ciechanow.ski/)
  and 3Blue1Brown: interactive cause and effect, visual intuition, and mathematics
  attached to what the visitor can see. Develop this explanatory layer iteratively.
- Make controls and diagrams reveal the actual technique in the scene. Use clear
  visual correspondence between geometry, forces, equations and their effects.
  Introduce culling, distance detail, depth and other pipeline choices where they
  become meaningful; define terms through examples rather than assuming expertise.
- The educational destination is an accessible understanding of the field's
  state of the art: how it arrived there, current techniques and tradeoffs, and
  open problems. Early studies build the intuition needed to reach that point.
  Study 08 is an intermediate step, not a claim to represent the current frontier.
- Preserve a welcoming gallery view, with optional ways to look closer. A wall of
  technical text or a collection of unexplained debug switches is not the desired
  presentation. Explanatory views must be truthful about what they visualize.

## Writing and research

- Write for a person discovering the project for the first time. Explain the
  techniques, what they can try, and why each technique is interesting.
- Public copy has no collective narrator: avoid "we", "our" and "us". Describe
  the grass, techniques and interactions directly. Avoid product, launch or grand
  mission framing. Keep the artistic intent in the work and its explanations.
- SOURCED / UNKNOWN are internal working distinctions between Nathan and the
  agent. Use them to check claims; do not print them as labels in documentation,
  interface copy, research articles, or ordinary replies. This project-specific
  instruction supersedes the earlier blanket instruction to label every claim.
- Keep sources close to the claims they support. Preserve factual accuracy without
  turning the reader's experience into an audit report or a defense of our work.
- State uncertainty naturally where it affects understanding of a technique or
  comparison. Keep it proportional and avoid repeating caveats per example.
- Public documentation should contain the subject, findings and useful explanations.
  Keep agent instructions, verification chores, conversation history and reasoning
  about evidence quality out of it. Put working instructions in this file.
- Lead with the interesting idea. Prefer connected prose and concrete examples;
  use tables for real comparisons, not repetitive status/evidence/limitation fields.
- Describe the project positively and directly. Avoid courtroom language, defensive
  disclaimers and lists of things we are not claiming. Explain practical limits
  when they help someone understand or use the study.
- When Nathan corrects scope or editorial direction, incorporate it into the work
  and revise affected text. Do not turn the correction into a defense or apology.
- Documentation changes need an editorial read for meaning, flow and audience,
  plus link checks where relevant. They do not require running browser tests.

## Historical research method

- Research meaningful jumps in grass rendering and interaction through three
  connected lenses: algorithms; the importance of grass to the scene and play
  relative to its share of the whole pipeline's budget; and advances in hardware.
  Chronology provides context for these changes. Establishing first or last uses,
  inventors or historical priority is not a goal of this study.
- Build the candidate list from the general history of 3D games on personal
  computers, in chronological batches. Start with early releases across genres;
  do not use "grass" or vegetation as the initial discovery filter.
- Then inspect those games for grass. Keep observations of bare ground, abstract
  environments and scenes without visible grass: they belong in the comparison.
  Realism guides what we study in grass, not which games enter the initial survey.
- Track the platform and release version as well as the title. Date a port by its
  own release; distinguish original assets from remasters, mods and replacements.
- Use catalogs, contemporary magazines and broad histories to discover releases.
  Examine original gameplay, screenshots and manuals to identify their ground
  cover; use developer accounts, source code and technical publications to explain
  implementation. Record what was actually inspected.
- Distinguish a green surface, grass depicted on the surface, and grass rising
  above it. Color alone does not identify grass. A frame without grass describes
  that view, not every scene in the game; leave unexamined cases open internally.
- Once release volume becomes too large for individual coverage, organize the
  chronology by engines and rendering techniques. Compare representative games,
  meaningful changes and variations within each family; sharing an
  engine does not establish identical grass rendering or behavior.
- Use grass-specific searches to investigate examples found through that survey
  and fill gaps. Choose examples for what they teach about a technical change.
- For each substantial comparison, connect the visible or interactive gain to
  the work needed to produce it and its place in the rest of the scene. Consider
  CPU/GPU time, memory, bandwidth, geometry and pixel work where relevant. A jump
  can come from a better algorithm, spending more on grass, more capable hardware,
  or a combination; do not assume every change introduces a new algorithm.
- Establish hardware capabilities and performance budgets from sources when
  explaining a historical change. A release date or screenshot alone does not
  establish its cause. Keep missing measurements internal instead of inventing
  numbers or adding empty audit fields to the article.

## Study and implementation

- This is an exploratory art study with Nathan. Preserve each accepted technique
  as a selectable presentation step. Nathan authorized completing the sequence
  through a Ghost of Tsushima-inspired field. Nathan brought rain, surface wetness and gradual sky transitions forward into
  study 09. Dripping, ray tracing and neural simulation remain later studies.
- Present techniques as slides with side arrows and fade only the grass out/in,
  all within one persistent scene. Terrain, character and UI remain visible.
  Open on the bare-ground baseline. Keep the character and camera across changes.
  Implement the ideas with current tools; game references do not require faithful
  recreation of their original renderer or hardware.
- Presentation borrows the pacing and typography of a visual novel: let the scene
  breathe and give the reader control over revealing, completing and dismissing
  each passage. Never auto-dismiss the text. Keep daily navigation quiet, with
  explanations, wind controls and performance statistics available on demand.
- Wind composition uses an N-vector field, with an editable collection of sources.
  Two is the initial configuration, not a structural limit. Reverse and opposition
  already apply at N=2; do not postpone these basics to an advanced study.
  Sources have independent spatial origins. Position-dependent vectors, including
  vortices/redemoinhos, belong in 08 already; they do not depend on later fluid
  dynamics, wetness or light-transport studies.
- Share world-space patch identities across consumers while allowing each
  algorithm its own resolution, range and cost. Modulo addresses reusable storage;
  it must not replace world identity. Carry outgoing state through a gradual
  handoff until the incoming representation takes over. Preserve wind phase and
  contact recovery; future audio consumers must preserve playback and effect tails.
- Research grass as traversable ground cover, with realism as the reference. Tall,
  dry, wet, frosted and icy grass qualify; bushes and generic thickets do not.
  Keep historical claims and their evidence in research/research.md.
- Use Three.js with WebGL and ordinary source files; no editor requirement.
- The study and its research are engine-independent. Three.js/WebGL is the
  current presentation implementation, not a boundary on research or techniques.
  Compare algorithms and implementations across engines and native renderers;
  distinguish the technique from the API used to implement it. Nathan has legal
  access to engines; do not exclude a reference based on assumed licensing limits.
  Unreal Engine and SpeedTree are explicitly authorized research references,
  including source and technical materials available through Nathan's access.
  Research should inspect implementations and tradeoffs, not stop at feature lists.
  Check which source, tools and versions are actually available before claiming
  to have inspected or executed an implementation.
- This is a PC-first study. Prioritize keyboard/mouse, desktop visuals, and desktop
  performance. Keep existing responsive/touch fallbacks functional, but do not
  expand mobile-specific design or testing unless Nathan asks.
- Reuse the imported, rigged character and animations. The subject of the study is
  grass, multiple winds, and interactions, not character modelling.
- Keep code, identifiers, documentation, and interface text in English.
- Ground-cover approaches are the studies themselves: preserve each representation
  as an exhibit, including its explanation and cost. Comparisons do not select a
  winner that replaces the others.
- Character, mouse brush and physical objects share contact-source semantics and
  the simulation tick. Keep rendering independent of source ownership so a later
  physics engine can supply transforms and contact footprints.
- Keep the common terrain, character scale, camera, and comparison conditions
  stable when comparing vegetation techniques, unless the experiment requires a change.
- Terrain must remain walkable, with hills and valleys. Future winds are plural:
  allow distinct sources/directions to coexist rather than assuming one global sway.
- Right mouse drag controls the camera. Left mouse brushes grass in the contact
  studies. Keep browser context menus and selection out of the scene,
  without blocking interface buttons. Touch uses a one-finger camera drag.
- Shift is the sprint key. Nathan configures Firefox's Shift+right-click override
  himself; test that chord with the override disabled in an isolated profile.
  Keep general input interruption recovery. Configurable bindings are for later.
- The scene runs continuously on browser animation frames. Do not add pause,
  auto-pause or resume state. Blur, hidden tabs and cancelled pointers clear held
  input and movement velocity without latching the simulation off. Keep bounded
  simulation steps so returning after browser throttling causes no large jump.
- Keep the performance HUD available through F3/Stats. Report actual supported
  measurements and name their scope; never substitute CPU timings for GPU timings.
- Source external assets and preserve their licenses. Runtime assets stay local.
- Tests and screenshots stay local and ignored. Run browser input in an isolated
  browser; never synthesize input into Nathan's personal desktop session.
- Keep publication history as one amended commit until Nathan explicitly says
  "ok we green lets go". Update the existing release tag with that commit.
- Files and Git operations belong to lynxnathan. Do not alter the desktop setup.
- Validate state transitions and rendered effects, including recovery and input
  cancellation. Distinguish simulation, visual approximation, and unimplemented work.
