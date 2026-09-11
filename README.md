# Placard

A painting is the thing everyone has already seen. What nobody sees is the
weight of writing behind it — the letters, the reviews, the catalogue entries,
the arguments. So the paintings here are built out of that writing: every
stroke on every canvas is a character from a text about that work, moving
through the corpus in reading order. Hold the cursor still and the picture
resolves out of its own words.

Seven museums, ten works each, each corridor modelled on the real room it is
named after. Navigation is spatial: **entrance → corridor → floor plan →
gallery rail → one painting**.

Requires WebGL2. Sound is off until you turn it on.

**[Open the exhibition →](https://placard-ten.vercel.app/)**

---

## At a glance

|  |  |
|---|---|
| **What it is** | A browser exhibition of seventy paintings, each one drawn live out of the writing about it |
| **Built with** | TypeScript · React · three.js / react-three-fiber · GSAP · Zustand · Vite |
| **Rendering** | A custom instanced-glyph shader draws tens of thousands of characters into an off-screen target each frame; seven procedurally modelled museum rooms, no external 3D assets |
| **Pipeline** | An offline build turns authored records and public-domain scans into image ladders, text corpora and packed glyph binaries |
| **Runs on** | Anything with WebGL2, phone to desktop, under a three-step quality budget that measures its own frame times and steps down if it has to |

This repository is published to be read and studied. It is not a template, and
there are no deployment instructions here — see [Using this code](#using-this-code).

---

# Visiting

## The seven rooms

| Museum | The corridor |
|---|---|
| **Musée du Louvre** | white barrel vault pierced by arched skylights, thick classical moulding, deep blue-grey walls, salon hang stacked to the cornice |
| **The British Museum** | a sand-walled hall at sunset under a deep grid of stepped coffers, two colonnades of fluted columns standing clear of the walls, low sun through tall windows on one side, carved marble benches down the centre |
| **The National Gallery** | crimson walls under a pitched glass lantern on gilded archways, polished light wood, tufted leather seating |
| **Vatican Museums** | a barrel vault of gilded stucco and painted compartments lit from the cornice upward, walls of painted map panels in ocean blue and forest green, a black and white labyrinth polished to a mirror |
| **Galleria degli Uffizi** | warm brown crossbeams over painted grotesque compartments, the hang down one side and a run of tall windows down the other, a diagonal checkerboard floor with the day lying on it |
| **Musée d'Orsay** | the colossal arched steel-and-glass nave, two rows of pale stone benches down the concourse, stone terraces behind glass railings, the great gilded clock closing the far end |
| **The Metropolitan Museum of Art** | a sunlit court under a peaked skylight: red brick and white voussoired arches one side, marble ashlar the other, a glass wall at the end |

The British Museum room is its **Egyptian sculpture gallery, Room 4**, with
the sculpture taken out and benches where the plinths were. What hangs between
its columns is the museum's painted and printed holdings — woodblock prints, a
tomb fresco, a papyrus, a scroll, a woven silk, a Rubens drawing — which have no
permanent room of their own. Every corridor records which real room it follows
and where it departs from it.

## Moving through it

The controls are stated in the interface as well: the moves for the room you
are standing in, on a quiet scrim along the bottom of the screen, and the
complete set behind the **?** in the bottom right corner.

| Where | Input | What happens |
|---|---|---|
| Entrance | click a museum | fetches that wing and walks you into its corridor |
| Corridor | move the mouse | look around — wide enough to face either wall |
| Corridor | <kbd>↑</kbd> <kbd>↓</kbd> | walk forward and back; a tap is a step, a hold is a stride |
| Corridor | <kbd>Shift</kbd> | hurry to the far end |
| Corridor | wheel, drag | also moves along the rail |
| Corridor | click a canvas | walk straight into that painting's room |
| Floor plan | click a room | choose a painter and warp into their room |
| Gallery | wheel, <kbd>←</kbd> <kbd>→</kbd> | move between paintings, with a magnetic snap |
| Gallery | move over a painting | the **reading lens** — a soft circle where the words give way and the paint shows through |
| Gallery | click, or <kbd>Enter</kbd> | the whole work dissolves out of its text and the wall label arrives |
| Gallery | <kbd>space</kbd>, or the **Threads** toggle | **Thread Pull** — the canvas becomes a map of its own passages |
| Gallery | <kbd>+</kbd> <kbd>−</kbd>, ⌘/Ctrl-scroll, pinch | lean in and back — a room gesture only; the corridor camera is on a rail |
| Gallery | <kbd>0</kbd> | back to the distance the room was composed for |
| Anywhere | <kbd>Esc</kbd> | step back one level |
| Anywhere | the **?** by the quality words | the whole set of controls, in one card |

<kbd>Esc</kbd> walks the whole way out: painting → gallery → floor plan →
corridor → entrance.

**Hover looks, click decides.** Moving over a canvas opens the reading lens and
nothing else: the room does not slide, the label does not arrive, the work does
not dissolve out from under you. Clicking is the decision.

**The corridor lights one work at a time.** Bringing the cursor onto a canvas
drops the room's exposure and brings a narrow warm spot up on that painting,
which is how a gallery is actually lit, and what makes a wall of seventy
rectangles resolve into one thing worth looking at.

## Thread Pull

Press <kbd>space</kbd> and the canvas becomes a map of its own passages.
Hovering a region — the gap between two hands, the claw of foam, the figure on
the steps — lifts that region's text out of the painting and assembles it into
a reading panel. **Pin this thread** holds one still while you read it;
<kbd>space</kbd> or <kbd>Esc</kbd> sends them home.

It is a mode, and a mode you cannot see is a mode you cannot tell from a bug,
so a gilt pill sits low on the screen for exactly as long as it is on.

## The atlas

Seventy works, laid out as a graph of what they share — a painter, a city, a
century, a subject. It is a second WebGL canvas of its own, and the room behind
it stops drawing entirely while it is open. The layout is solved once and then
held still: a graph that drifts while you are reading it is a graph you cannot
point at.

## Sound

Off until you press the switch, always. Sound that starts by itself is an
ambush, and the audio graph is not even built until you ask for it.

The entrance has its own piece; each corridor shuffles a set of four; the atlas
takes one of them a long way down. Moving between them is a crossfade, so
choosing a museum is a door rather than a cut. Standing in front of an open
painting thins the room to an ambient bed with nothing arriving in it, and
walking away brings it back — over seconds, never in a jump. Every recording is
credited in the **Colophon → Sources → Music**.

## If it runs slowly

Bottom right: **Smooth**, **Balanced**, **Rich**. Hovering one says what it
buys. The exhibition also measures its own frame times for a few seconds when
it starts and steps down once if the room is not keeping up — but never up, and
never over a choice you have made yourself.

**Smooth** is the one to reach for if the fan comes on. It drops the frame cap
to thirty, turns off multisampling, and asks the browser for the low-power GPU
rather than the discrete one, which on a two-GPU laptop is most of the heat by
itself. Whatever budget you are on, the room stops drawing entirely while the
atlas, the map or the credits are open, and while the tab is in the
background.

## Accessibility

`prefers-reduced-motion` is honoured throughout: the corpus animation freezes,
the entrance falls back to a still slideshow, and every transition becomes a
cut. Every artwork has a keyboard- and screen-reader-reachable proxy, the
corridor and gallery are navigable by arrow keys alone, and <kbd>Esc</kbd>
always steps back one level.

---

# How it is built

## The shape of the repository

```
data/         everything authored by hand — museums, artwork records, the
              provenance of every reproduction. The source of truth.
scripts/      the offline pipeline that turns data/ into what the browser
              fetches: image ladders, text corpora, packed glyph binaries
src/
  scenes/     the corridor, the gallery, the artwork room, the entrance hero
  scenes/corridor/  ceilings, floors, walls, fixtures, atmosphere
  glyph/      the atlas, the shader, the instanced pre-pass
  render/     when the canvas is drawn, and how often
  ui/         everything in the DOM over the canvas
  state/      one store for the room, one for the atlas, one for the door
  lib/        audio, music, images, quality, device tiering
shared/       types shared between the build and the runtime
```

Nothing about a particular building is hard-coded in the renderer. A museum is
a record: its identity, the room it follows, and a `style` block that drives
the whole corridor — ceiling, floor, wall and frame kinds, the hang pattern,
room proportions, a ten-colour palette, a full lighting rig, and which fixtures
to place. An artwork is a record too: the placard, the painter's accent colour,
how it should be cropped for the entrance, and optionally the hand-authored
regions Thread Pull reads.

## The glyph field

**Build time.** Each painting is published as three sizes in three formats —
`wall` for the corridor, `view` for the reveal, `full` for the upgrade, each as
AVIF, WebP and JPEG. It is then analysed once by a quadtree variance
subdivision — small cells across faces and detail, large cells across sky and
flat ground — and emitted as a compact binary held to a glyph budget, so no one
painting can cost several times what its neighbours do. The work's corpus is
cleaned, stripped of whitespace and encoded as charset indices; where a work
has no historical texts on disk, the corpus is built from its own wall label
and extended note, which is the premise stated at its smallest.

**Runtime.** One instanced draw call renders every glyph — up to twenty
thousand letters for one draw. All per-glyph attributes upload once and the
animation is uniform-driven: the *character occupying each slot* advances
through the corpus over time while positions and colours stay fixed, so the
painting holds still while its history scrolls through it. The reveal, the
reading lens and Thread Pull are the same mechanism seen three ways — a
per-glyph dissolve threshold compared against a global value, a radius around
the cursor, or a rectangle around a semantic region.

**Tone.** A letterform covers only 20–30% of its cell, so drawing letters alone
over a dark ground reproduces a painting at a quarter of its true luminance.
Each glyph instead fills its cell with the cell's mean colour at a low opacity
and draws the letterform brighter on top.

## The rooms

**Frames.** A frame is a stack of concentric extruded, bevelled mouldings —
"courses" — optionally carrying a bead course, corner cartouches, reeding or a
full architectural tabernacle. Courses are merged by material before they reach
the GPU, so an elaborate five-course frame with ornament costs three draw calls.

**Corridors.** Ceiling, floor, wall treatment and fixtures are half a dozen
implementations each, selected by the style record. Everything repeated — ribs,
purlins, mullions, pilasters, brick courses, paving joints, dentils, bead
courses, dust motes — is instanced.

**Hanging.** Every work is centred on a shared hanging line and the moulded
panel behind it is centred on the same line, so a canvas sits in the middle of
its surround rather than sinking to the bottom of it. Works too wide to hang at
full height give up height rather than run into their neighbours.

**The artwork room.** Each painting sits in a full moulded bay — fluted
pilasters, entablature, cornice, dentils, a raised bolection panel, a coffer
overhead — and the entire room, walls, joinery, fill light, fog and background,
takes the painter's own accent colour, easing from one to the next as you move
along the rail.

**Sound.** The ambience is real music streamed from YouTube through two hidden
IFrame players — two, because one player holds one video and a single player
makes every room change a cut. The recordings are not ours to copy; an embed is
the arrangement the uploaders have agreed to, and it keeps megabytes of audio
out of the bundle. Everything that has to land on a particular frame is
synthesised in WebAudio instead: a convolution reverb built rather than
recorded, the chime when a work resolves, the swoosh when the wall label
arrives, the swell through the end wall. So is the room tone — a warm drone,
formant murmurs and footfalls in irregular pairs — which is the *fallback*,
played only when the player cannot be built at all, because the alternative is
silence.

## Choosing the pictures

Every reproduction comes from Wikimedia Commons, resolved offline before a
build. The resolver prefers an exact file pinned by hand, falls back to the
curated image statement on the work's own Wikidata item, and only then to a
scored search — because search is the only step that can be confidently wrong,
and a wrong painting hung under the right label is worse than no painting at
all.

Candidates lose points for being the failures this exhibition actually
suffered: the work photographed *in its frame*, the work on a gallery wall with
visitors in front of it, an engraving after it, a detail, or plainly a
different painting. Words are read in context — "engraving" is damning for a
painting and merely accurate for a Dürer woodcut — and a candidate is matched
against the work's names in every language it is catalogued under, because
Commons files Vermeer's Girl under *Meisje met de parel*.

The sharpest test is arithmetic rather than vocabulary. Every record states the
work's real dimensions, so its true proportions are known before anything is
downloaded, and a frame or a room around the canvas changes them by far more
than two reproductions of the same painting ever differ. That check runs again
on the real pixels after the download, so a hand-pinned photograph of a frame
is refused as firmly as a search result would be.

It cuts both ways: a pin that fails the proportions test is usually the pin
being right and the *catalogue* being wrong about what is in the picture. The
Urbino diptych is measured panel by panel — 47 × 33 cm each — and photographed
as a pair, so the file is twice as wide as the record expected until the record
says `47 × 66 cm as hung`.

Everything hung is old enough to be in the public domain; reproductions are
PD-Art in the US and most of Europe. Whatever licence Commons states per file
is recorded rather than assumed, and published on the work's own placard.

## The door

The exhibition used to open the moment the museum list arrived — long before
anything was ready to be drawn. The bundle still had to be parsed, the first
painting's glyph binary still had to be fetched, and, most expensively, the
shaders still had to be compiled: a custom GPU program cannot be built until
something first tries to draw with it, and that compile stalls the whole page.
So the stall happened in plain sight, one frame after a loading bar had filled
and promised the visitor it was finished.

Now three real pieces of work report in — the catalogue, the first canvas, the
light — and the door opens only once a frame has actually been drawn behind the
curtain. What covers the wait is the exhibition's own material: a wall of text
stepping and breathing exactly as the paintings do, lighting from dim bone to
gilt in reading order as the steps land. The progress *is* the text being lit.
There is no bar, because a bar would be furniture, and this site does not have
furniture.

## Performance

Three budgets, chosen from the device and overridable by the visitor. Measured
in the corridor at 1280×720, per frame:

| Budget | Draw calls | Triangles |
|---|---|---|
| Smooth | ~400 | ~70k |
| Balanced | ~530 | ~100k |
| Rich | ~930 | ~225k |

What each switch buys:

- **Reflections** — the mirrored floor is *a second full render of the scene*
  into a mirror buffer. It roughly doubles draw calls on its own, so it belongs
  to Rich alone; below that the floor is a polished standard material, still
  glossy under the lamps, one draw call.
- **Shadows** — a third scene pass into the shadow map. Buys the bars of light
  across the floor.
- **Ornament** — bead courses, cartouches and reeding, on the nearest few bays
  only. A bead course is invisible at ten metres and costs tens of thousands of
  triangles across a salon wall.
- **Atmosphere** — light shafts and drifting dust. Cheap, and the first thing
  anyone notices, so it survives further down than it deserves to.

Auto-detection never picks Rich. It reads a renderer string and a core count,
which says what the machine is and nothing about what else it is doing, and
guessing high costs a stuttering first impression.

### What is drawn, and how often

The budgets above decide how much is in a frame. These decide how many frames
there are, which for a room that mostly drifts turns out to matter more.

- **The frame loop is capped, and stops.** Thirty frames a second on Smooth,
  sixty on the other two. Nothing here resolves faster than that — the camera
  eases, the letters breathe, the dust falls — so on a 120Hz laptop panel the
  uncapped loop was drawing the whole corridor twice for every change anybody
  could see. It stops outright whenever something opaque is over the canvas:
  the atlas, which is a second WebGL canvas of its own; the map, which is a
  scrim over a blurred still; the credits sheet; another tab. The last frame
  stays on screen, which is exactly what those screens were showing anyway.
- **One picture light per bay in range, not one per painting.** Three.js has no
  spatial culling for lights: every light in the scene goes into the uniform
  array and every lit fragment loops over all of them. A seventy-work wing had
  seventy of them, sixty-five of which were beyond their own falloff and
  contributing exactly zero. The gallery now slides a fixed window of five
  along the rail — fixed, because the light count is compiled into the shader
  and a count that changed as you scrolled would recompile every material in
  the room mid-scroll.
- **The glyph field redraws at thirty a second while it is still.** The
  pre-pass is the most expensive thing in the gallery — tens of thousands of
  instanced quads into a render target up to 2048 square — and the corpus it
  animates steps six characters a second. Moving the reading lens, dissolving a
  work or pulling a thread takes it straight back to full rate for as long as
  that lasts.
- **Shadow maps are drawn when the light moves.** Each one is a third pass over
  the room's geometry, and three.js runs it every frame by default. The only
  caster in either room is a single light over architecture that never moves,
  so the map is redrawn while the visitor is walking and not while they are
  standing still.
- **Dust is moved thirty times a second.** Four hundred instance transforms
  rebuilt and re-uploaded for motes drifting at a few centimetres a second is
  arithmetic with no visible result. The skipped time is carried, so they fall
  at the same speed.
- **Textures are held, counted, and let go.** A painting's corpus, palette and
  wall texture are reference-counted while something is looking at them and
  disposed on the GPU a few seconds after the last viewer walks away — dropping
  the JavaScript reference alone leaves the memory where it was. Six works stay
  resident, which is as many as any one screen can be showing.
- **The DOM stops writing when it has arrived.** The cursor ring's loop ends
  once it has caught up and wakes on the next pointer event; the wall label and
  the placard measure themselves when their size changes rather than on every
  frame, and skip writes that would set the transform they already have.
  Blurred backdrops were removed wherever something opaque could do the same
  job, because a `backdrop-filter` is recomputed every frame its backdrop
  changes.

Nothing on this list changes what the exhibition looks like. They are all the
same picture, arrived at without redrawing the parts of it that had not
changed.

**What a visit downloads**, excluding the JavaScript bundle, which is cached
after the first visit:

| | |
|---|---|
| Entrance, first paint | ~22 KB, one picture |
| Walking into a corridor | ~39 KB |
| Opening a painting's room | ~34 KB |
| Revealing the painting | ~77 KB |

Three structural decisions get it there. Nothing is fetched before somebody has
asked for it: the corridor holds 512px textures, a reveal pulls the 1200px
rung, and the 2000px rung follows only if the visitor stays with the work.
Every picture is published as AVIF, WebP and JPEG and the browser is handed the
smallest it can decode, probed once with a two-pixel image of each format
rather than guessed from a user-agent string — and because AVIF above about q52
comes out *larger* than JPEG on heavy impasto, each variant is checked against
its JPEG at build time and re-encoded a notch lower until it actually wins. And
the low device tier doubles both quadtree bounds rather than just the floor,
which is what actually quarters the glyph field rather than shaving two percent
off it.

The bundle is split so the renderer caches separately from the exhibition:
`three` and `r3f` change only on a dependency upgrade, the app itself every
time a placard is edited, and the corridor, the gallery, the atlas and the
colophon are each fetched the first time somebody goes there.

---

## Known limits

**The sculpture is procedural.** The figures and busts in the corridors are
abstracted marble forms built for their silhouette. They are the weakest thing
in the rooms. Real scans would be better, and the obvious sources publish for
3D *printing* — tens of millions of untextured triangles per figure, licences
that are per-model and often non-commercial — so each would need a
decimate-and-bake step run offline and a hand-written transform of its own.

**Catalogue details are stated from published museum records** and are worth
verifying against the museums' own collection pages. Accession numbers are
given where they are known and left blank otherwise. Wall labels and extended
notes are written for Placard.

**Two entries need their provenance read carefully.** *The Geese of Meidum* —
the original panel is in the Egyptian Museum in Cairo and the British Museum
holds nineteenth-century facsimiles. *The Admonitions Scroll* — shown as a
section, because a handscroll is eleven metres long and is meant to be read an
arm's width at a time. Both say so on their placards.

## Using this code

The code and the writing here are mine. The repository is public so that it can
be read — the architecture, the shader, the pipeline, the decisions above — and
not as a starting point for a copy of the exhibition. Deployment configuration,
the asset build and the site's own environment are deliberately not documented
here.

Please don't publish this exhibition, or a re-skin of it, under your own name.
If you want to build on any part of it, or use it in something of your own,
write to me through the form in the Colophon — the answer is usually yes.

All rights reserved. The paintings themselves are public domain; their
reproductions are credited per file in the Colophon.

## Credits

The in-app **Colophon** lists every corpus source with licence and attribution,
the provenance of every reproduction, the music, and the stack: three.js,
@react-three/fiber, drei, GSAP, Zustand, Vite, sharp.
