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
permanent room of their own. Every corridor
carries a `corridorNote` in `data/museums/{id}.json` saying which real room it
follows and where it departs from it.

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

# Developing

## Quick start

```bash
pnpm install
pnpm fetch:images   # pull the real paintings from Wikimedia Commons
pnpm check          # read the records and say what is wrong with them
pnpm build:assets   # regenerate public/ from data/ — images, corpora, glyphs
pnpm dev
```

Node ≥ 20. `pnpm approve-builds` may be needed once so `sharp` can install its
prebuilt binaries. `public/artworks/` and `public/museums/` are generated and
not committed, so `build:assets` has to run once after install; it takes a few
minutes, because seventy works are each analysed into a glyph field twice.

`fetch:images` is optional — skip it and any work without a scan renders a
procedural stand-in, which is honest and obvious and not what you want on a
published site.

| Command | |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | typecheck and build to `dist/` |
| `pnpm preview` | serve the built site |
| `pnpm check` | validate the authored records and the Commons scorer, offline |
| `pnpm build:assets` | regenerate every published asset from `data/` |
| `pnpm build:assets:strict` | the same, but a work with no real scan fails the build |
| `pnpm fetch:images` | fetch the paintings from Wikimedia Commons |

With npm rather than pnpm, flags need `--` in front of them, or npm reads them
as its own config: `npm run fetch:images -- --dry --only manet-olympia`.

## Repository map

```
data/
  museums/order.json        the museums, in the order the entrance lists them
  museums/{id}.json         identity, corridor style, floor plan, works hung
  collections/{id}.json     an array of self-contained artwork records
  artworks/{id}/            optional per-work overrides — see below
  image-sources.json        where the fetcher looks for each work on Commons
scripts/                    the asset pipeline, all of it offline-first
  fetch-images.ts           resolve and download from Wikimedia Commons
  build-all.ts              images + corpora + glyphs + manifests
  build-glyphs.ts           quadtree analysis → glyphs.bin
  build-corpus.ts           text → charset indices → corpus.bin
  build-images.ts           the three-size, three-format ladder
  build-placeholder.ts      procedural stand-ins for works with no scan
  check.ts                  what `pnpm check` runs
src/
  scenes/                   the corridor, the gallery, the entrance hero
  scenes/corridor/          ceilings, floors, walls, fixtures, atmosphere
  glyph/                    the atlas, the shader, the instanced pre-pass
  render/                   when the canvas is drawn, and how often
  ui/                       everything in the DOM over the canvas
  state/                    one store for the room, one for the atlas
  lib/                      audio, music, images, quality, device tiering
shared/                     types shared between the build and the runtime
```

## Authoring

Adding a museum is two files and a line in `order.json`. Adding a work is one
record.

A **museum record** carries its identity — name, city, subtitle, the blurb the
entrance lists, the `corridorNote` saying which real room it follows, and the
`homepage` the corridor title and the colophon link out to — plus a `style`
block that drives the entire corridor: `ceiling`, `floor`, `wall` and `frame`
kinds, the `hang` pattern, room proportions, a ten-colour palette, a full
lighting rig (key colour, intensity and direction; sky and ground fill; lamp
colour; tone-mapping exposure; background and fog) and which fixtures to place —
sculpture, seating, chandeliers, label stands, ropes, vitrines, a lighting
track, a clock, terraces, whether the room is lit by its windows rather than by
its lamps, and whether it has a cove throwing light up into its ceiling.
Nothing about a particular building is hard-coded in the renderer.

`hang` decides how the works are distributed: `salon` stacks three to a bay on
both walls, `single` hangs one per bay on both, `alternating` swaps sides bay by
bay, and `one-wall` hangs everything on the left — for the Uffizi, whose other
side is a run of windows, where anything hung opposite would be seen against
the day.

An **artwork record** carries the placard (artist, dates, title, year, medium,
dimensions, room, accession, credit line, wall label, extended note), the
painter's `accentColor`, an optional `heroFocus`, a `placeholder` spec, and
optionally hand-authored Thread Pull `regions`.

`heroFocus` is `[x, y]` in normalised image coordinates with y down, and it
matters in exactly one place: the entrance is the only screen that crops a
painting, and a centred crop of a tall canvas throws away the face. Omit it and
a tall work is held a little above centre and everything else in the middle.
`heroSkip: true` keeps a work off the entrance altogether — a scroll six times
wider than it is tall, or a work whose best scan is soft at full bleed, is
fine on a wall and wrong across a window.

`frameShape` handles the works a rectangle is wrong for. `'round'` turns the
museum's own moulding on a lathe and cuts the canvas to a circle, for a tondo;
`'divided'` keeps the rectangle, runs a moulded bar down the centre and gives
the surround two extra carved courses, for a pair of panels hung as one object.
A round work is cut to the same silhouette in the shader as in the frame, so
the words stop where the panel does. Omitted, a work takes the museum's plain
frame.

`data/artworks/{id}/` is optional and exists only to override generated assets:

| File | Overrides |
|---|---|
| `source.jpg` | the real public-domain scan — the one file worth adding |
| `sources.json` + `corpus/*.txt` | building the corpus from the record's own placard text |
| `regions.json` | Thread Pull regions (records may also carry them inline) |
| `config.json` | glyph tuning — cell sizes, variance threshold, palette size, `maxGlyphs` |

Run `pnpm check` after any edit. It reads the records without touching the
network and reports a museum whose floor plan points at a room that is not
there, a work listed by a museum but missing from its collection, an impossible
Thread Pull box, a wall label too short to build a corpus from, and — the one
that matters most — a scan whose proportions are far enough from the catalogued
dimensions that it is probably framed, cropped, or a different painting.

## Pictures

Every reproduction comes from Wikimedia Commons. `pnpm fetch:images` resolves
each work, downloads a 2000px render and writes `data/artworks/{id}/source.jpg`
plus an `image-credit.json` recording the exact file, its stated licence and
its author — which is what the Colophon then publishes on the work's placard.

```bash
pnpm fetch:images --dry      # resolve everything, download nothing — read this first
pnpm fetch:images            # fetch every work that has no scan yet
pnpm fetch:images --check    # which scans disagree with their pins, offline
```

**How a picture is chosen — three steps, most trustworthy first.**

1. **`commonsFile`** in `data/image-sources.json` — an exact file, used as
   given, because a person looked at it and said so. A pin is a decision, not a
   hint: if it cannot be resolved the work *fails* rather than falling through
   to search, because a silent fall-through looks exactly like the pin having
   no effect.
2. **Wikidata.** The work's own item carries P18: a curated statement that this
   file is the image *of this artwork*. The item is found by search and then
   proved before it is trusted — it has to be typed as an artwork and its
   description has to name the artist — so a "Mona Lisa" that turns out to be a
   pop song is discarded rather than hung.
3. **Commons file search, scored.**

Scoring exists because search is the only step that can be confidently wrong,
and a wrong painting hung under the right label is worse than no painting at
all. Candidates lose points for being the failures this exhibition actually
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
is refused as firmly as a search result would be. Anything that clears neither
is left on its stand-in.

It cuts both ways: a pin that fails the proportions test is usually the pin
being right and the *catalogue* being wrong about what is in the picture. The
Urbino diptych is measured panel by panel — 47 × 33 cm each — and photographed
as a pair, so the file is twice as wide as the record expected and was refused
until the record said `47 × 66 cm as hung`.

| Flag | |
|---|---|
| `--dry` | resolve and print the table, download nothing |
| `--check` | compare what is on disk against the pins, without the network |
| `--force` | re-fetch works that already have a scan |
| `--pin` | write the resolved file names back into `data/image-sources.json` |
| `--sheet` | build the contact sheet even on a `--dry` run |
| `--concurrency 6` | works in flight at once (default 4, max 8) |
| `--museum louvre` | one museum only |
| `--only id1,id2` | named works only |

**Run once with `--pin` and commit the result.** It records the exact file
chosen for every work, so from then on the fetch is a lookup rather than a
search. Search rankings drift, and an exhibition that hangs a different picture
next month is not one you can point people at.

**Then open `data/.cache/contact-sheet.html`.** Every run builds it: one page
showing every picture with the file it came from, the catalogued
dimensions and how it was resolved. Seventy works is too many to check by
clicking through seventy Commons pages, and not checking is how an exhibition
ends up hanging a photograph of a frame. Each card carries a **pin this** block
to paste straight into `data/image-sources.json`:

```json
"manet-olympia": { "commonsFile": "File:Edouard Manet - Olympia - Google Art Project 3.jpg" }
```

Changing a pin is enough on its own — a scan that came from a different file is
treated as stale and re-fetched without `--force`. `pnpm fetch:images --check`
lists every work in that state.

A few entries need judgement rather than search: John White's album is a whole
class of object rather than one work, the Admonitions Scroll and the Papyrus of
Ani are both reproduced one scene at a time, the Vrindavani Vastra survives only
as a joined fragment, and several Van Gogh and Monet subjects exist in many
versions. Each of those carries a `note` in `data/image-sources.json` saying
what to look for.

### When a scan disagrees with its catalogue

`pnpm check` compares what is hanging against what the placard says is hanging,
offline, and there are only four things it can mean. The message names which:

**The pin has not been fetched yet.** *the scan on disk is not the pinned file*
— pinning a work does not download it. Run `pnpm fetch:images`, which
re-fetches every work whose pin has changed since its scan. Until then the room
is still showing whatever search found last time, and any other complaint about
that work is about a file already on its way out. Fix this one first.

**The file is the right subject in the wrong collection.** *the file names the
Altes Museum, Berlin, not this museum* — a Fayum portrait, a Dunhuang banner or
a Book of the Dead exists in a dozen museums, and search reaches for the
best-photographed one rather than the one whose room you are standing in. Pin
this museum's own object.

**The file is a copy.** *the file describes itself as a copy* — a facsimile or
a replica. Pin the original, or say so in the record (below).

**The proportions are wrong.** *the scan is 33% off the catalogued proportions*
— the file is framed, cropped, a detail, or a different version. Re-fetch it
with `pnpm fetch:images --force --only <id>` and pin a better one. But check
the other possibility first: that the catalogue is measuring something the
picture is not. A diptych photographed as a pair is not one panel; a handscroll
is shown as a section; the Geese of Meidum is in Cairo and what every other
museum hangs is a facsimile. Where that is the case, say so in the record:

```json
"reproduction": "The scroll is three and a half metres long … what is reproduced
                 here is the fourth of its nine surviving scenes"
```

That sentence is printed on the colophon beside the image credit, and both the
proportions check and the fetcher's own gate stop applying the whole object's
shape to a picture of part of it. It is a statement, not a silencer — a visitor
looking at one scene of nine is owed the same sentence the check was owed. A
work in that position can also carry a `link`, which the placard shows under
the wall text:

```json
"link": { "label": "The whole scroll, at the British Museum",
          "url": "https://www.britishmuseum.org/collection/object/A_1903-0408-0-1" }
```

To supply a scan by hand instead, save it as `data/artworks/{id}/source.jpg`
and run `pnpm build:assets`. `data/.cache/previews/{id}.png` shows the glyph
field for one work and is the fastest loop for tuning its `config.json`.

Everything hung is old enough to be in the public domain; reproductions are
PD-Art in the US and most of Europe. The fetcher records whatever licence
Commons states per file rather than assuming.

## How it works

**Build time** (`scripts/`). Each painting is published as three sizes in three
formats — `wall` 1024px for the corridor, `view` 1200px for the reveal, `full`
2000px for the upgrade, each as AVIF, WebP and JPEG. It is then analysed once
by a quadtree variance subdivision — small cells across faces and detail, large
cells across sky and flat ground — and emitted as a compact binary
(`glyphs.bin`, format in `shared/glyphFormat.ts`) held to a glyph budget so no
one painting can cost several times what its neighbours do. The work's corpus
is cleaned, stripped of whitespace and encoded as charset indices
(`corpus.bin`); where a work has no historical texts on disk, the corpus is
built from its own wall label and extended note, which is the premise stated at
its smallest.

**Runtime** (`src/glyph/`). One instanced draw call renders every glyph — up to
twenty thousand letters for one draw. All per-glyph attributes upload once and
the animation is uniform-driven: the *character occupying each slot* advances
through the corpus over time while positions and colours stay fixed, so the
painting holds still while its history scrolls through it. The reveal, the
reading lens and Thread Pull are the same mechanism seen three ways — a
per-glyph dissolve threshold compared against a global value, a radius around
the cursor, or a rectangle around a semantic region.

**Tone.** A letterform covers only 20–30% of its cell, so drawing letters alone
over a dark ground reproduces a painting at a quarter of its true luminance.
Each glyph instead fills its cell with the cell's mean colour at `uWash`
opacity and draws the letterform brighter on top.

**Frames** (`src/scenes/frames.ts`). A frame is a stack of concentric extruded,
bevelled mouldings — "courses" — optionally carrying a bead course, corner
cartouches, reeding or a full architectural tabernacle. Courses are merged by
material before they reach the GPU, so an elaborate five-course frame with
ornament costs three draw calls.

**Corridors** (`src/scenes/corridor/`). Ceiling, floor, wall treatment and
fixtures are half a dozen implementations each, selected by the style record.
Everything repeated — ribs, purlins, mullions, pilasters, brick courses, paving
joints, dentils, bead courses, dust motes — is instanced.

**Hanging.** Every work is centred on a shared hanging line and the moulded
panel behind it is centred on the same line, so a canvas sits in the middle of
its surround rather than sinking to the bottom of it. Works too wide to hang at
full height give up height rather than run into their neighbours
(`src/scenes/fit.ts`).

**The artwork room.** Each painting sits in a full moulded bay — fluted
pilasters, entablature, cornice, dentils, a raised bolection panel, a coffer
overhead — and the entire room, walls, joinery, fill light, fog and background,
takes the painter's own accent colour, easing from one to the next as you move
along the rail.

**Sound** (`src/lib/audio.ts`, `src/lib/music.ts`). The ambience is real music
streamed from YouTube through two hidden IFrame players — two, because one
player holds one video and a single player makes every room change a cut. The
recordings are not ours to copy; an embed is the arrangement the uploaders have
agreed to, and it keeps megabytes of audio out of the bundle. Everything that
has to land on a particular frame is synthesised in WebAudio instead: a
convolution reverb built rather than recorded, the chime when a work resolves,
the swoosh when the wall label arrives, the swell through the end wall. So is
the room tone — a warm drone, formant murmurs and footfalls in irregular
pairs — which is the *fallback*, played only when the player cannot be built at
all, because the alternative is silence.

## Performance

Three budgets, chosen from the device and overridable by the visitor. Measured
in the corridor at 1280×720, per frame:

| Budget | Draw calls | Triangles |
|---|---|---|
| Smooth | ~400 | ~70k |
| Balanced | ~530 | ~100k |
| Rich | ~930 | ~225k |

What each switch buys, in `src/lib/quality.ts`:

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

- **The frame loop is capped, and stops.** The canvas runs on
  `frameloop="never"` and `src/render/frameGovernor.tsx` drives it: thirty
  frames a second on Smooth, sixty on the other two. Nothing here resolves
  faster than that — the camera eases, the letters breathe, the dust falls — so
  on a 120Hz laptop panel the uncapped loop was drawing the whole corridor
  twice for every change anybody could see. `src/render/canvasGate.ts` stops it
  outright whenever something opaque is over the canvas: the atlas, which is a
  second WebGL canvas of its own; the map, which is a scrim over a blurred
  still; the credits sheet; another tab. The last frame stays on screen, which
  is exactly what those screens were showing anyway.
- **One picture light per bay in range, not one per painting.** Three.js has no
  spatial culling for lights: every light in the scene goes into the uniform
  array and every lit fragment loops over all of them. A seventy-work wing had
  seventy of them, sixty-five of which were beyond their own `distance` and
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
- **The DOM stops writing when it has arrived.** The cursor ring's loop ends
  once it has caught up and wakes on the next pointer event; the wall label and
  the placard measure themselves when their size changes rather than on every
  frame, and skip writes that would set the transform they already have. The
  map's scrim lost a `backdrop-filter` that was blurring a full screen of
  already-blurred canvas underneath a gradient ninety per cent opaque.

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
`three` (~178 kB gzip) and `r3f` (~17 kB) change only on a dependency upgrade,
the app itself (~60 kB gzip) every time a placard is edited.

## Deploying

The exhibition is a static site. Everything it serves — the glyph fields, the
pictures in three sizes and three formats, the manifests — is produced by
`pnpm build:assets` from the records, and the scans those are built from are
committed, so a build host needs no network access to Wikimedia and no secrets
to produce the whole thing.

### Vercel

`vercel.json` holds the whole configuration:

```json
{ "buildCommand": "pnpm check && pnpm build:assets && pnpm build",
  "outputDirectory": "dist",
  "framework": "vite" }
```

Import the repository at vercel.com/new and it needs no other settings. What
to expect, measured from a clean checkout:

| | |
|---|---|
| Build | about six and a half minutes, nearly all of it the glyph fields |
| Output | 90 MB, of which 88 MB is pictures |
| Node | 20 or newer; `packageManager` pins pnpm so the host resolves the same one |

`pnpm check` runs first deliberately: a record that points at a work which is
not there, or a floor plan with a room too many, fails the deploy rather than
publishing a broken room. Warnings — a work still on a stand-in, a scan whose
proportions do not match its catalogue — do not.

Set `VITE_CONTACT_ENDPOINT` in the project's environment variables if you want
the contact form. Without it — or `VITE_CONTACT_EMAIL` — the form is not
rendered at all, because a form that goes nowhere is worse than no form. See
[Contact form](#contact-form) for which of the two to use.

**If six minutes a deploy becomes annoying**, the fix is to stop rebuilding
what did not change: commit `public/artworks` and `public/museums` (they are
in `.gitignore` for a reason — they are generated — but they are also
deterministic), and set the build command to `pnpm build` alone. That trades
90 MB of repository for a twenty-second deploy. Do it when the exhibition
stops changing, not before.

### GitHub Pages

`.github/workflows/deploy.yml` does the same on every push to `main`. Turn it
on with **Settings → Pages → Source: GitHub Actions**; the site lands at
`https://<user>.github.io/<repo>/`.

Two caches carry the cost across runs:

| Cache | Keyed on | Effect |
|---|---|---|
| Fetched scans | `data/image-sources.json`, `data/collections/*` | Wikimedia is hit once, not on every deploy |
| Built assets | `data/**`, `scripts/**`, `shared/**` | editing one placard rebuilds that work and reuses the other sixty-nine |

`workflow_dispatch` has a **refetch** checkbox for pulling the paintings again
deliberately. The image fetch is `continue-on-error`, so an unreachable Commons
falls back to stand-ins rather than failing the deploy.

### Serving from a subpath

Every generated-asset URL goes through `src/lib/asset.ts`, which prefixes
Vite's `BASE_URL`:

```bash
pnpm build                        # a domain root — Vercel, Netlify, S3
BASE_PATH=/placard/ pnpm build    # a GitHub Pages project site
```

The workflow sets it from the repository name; override it with a `BASE_PATH`
repository variable for a custom domain (use `/`). On Vercel, leave it alone.

## Contact form

The **About** tab of the Colophon carries a three-field form. It needs one of
two environment variables, and with neither it does not render.

```
VITE_CONTACT_ENDPOINT=https://formspree.io/f/xxxxxxxx   # POSTs JSON, address stays private
VITE_CONTACT_EMAIL=you@example.com                      # composes a mailto:
```

**Prefer the endpoint.** Vite inlines `VITE_`-prefixed variables at build time,
so whatever goes in one becomes a plain string in the shipped JavaScript — an
address set here is readable by anyone who opens the bundle, and a crawler that
reads `.js` files finds it as fast as one that reads HTML. `VITE_CONTACT_EMAIL`
therefore publishes the address twice over: once in the bundle and once in the
mail client it opens in front of the visitor. `VITE_CONTACT_ENDPOINT` publishes
a form URL instead, and the address lives with the form service.

Formspree, Getform and Basin all give a free endpoint that takes a JSON POST
and forwards it to you. A serverless function of your own works too — anything
that accepts `{ name, email, message }`.

Because the substitution happens at build time, changing either one needs a
redeploy, not just a restart.

## Known limits

**The sculpture is procedural.** The figures and busts in the corridors are
abstracted marble forms built for their silhouette
(`src/scenes/corridor/Fixtures.tsx`). They are the weakest thing in the rooms.
Real scans would be better, and the two obvious sources are
[SMK's 3D models](https://www.smk.dk/en/article/3d-models/) and
[Scan The World](https://www.myminifactory.com/users/Scan%20The%20World);
neither is a drop-in. Both publish for 3D *printing* — STL or OBJ, tens of
millions of untextured triangles, 100–400 MB per figure — so each needs a
decimate-and-bake step (Blender, or `gltf-transform` + `meshopt`) run once
offline and committed as Draco-compressed glTF. Scan The World's licences are
per model and often **CC BY-NC-SA**, which is a real constraint on a published
site. And scale, up-axis and base height differ per model, so each one needs a
hand-written transform rather than a shared component. The runtime half is
easy: `useGLTF` and a manifest of `{ file, scale, rotation, plinth }`, falling
back to the procedural forms wherever a model is missing.

**Catalogue details are stated from published museum records** and are worth
verifying against the museums' own collection pages. Accession numbers are
given where they are known and left blank otherwise. Wall labels and extended
notes are written for Placard.

**Two entries need their provenance read carefully.** *The Geese of Meidum* —
the original panel is in the Egyptian Museum in Cairo and the British Museum
holds nineteenth-century facsimiles. *The Admonitions Scroll* — shown as a
section, because a handscroll is eleven metres long and is meant to be read an
arm's width at a time. Both say so on their placards.

## Credits

The in-app **Colophon** lists every corpus source with licence and attribution,
the provenance of every reproduction, the music, and the stack: three.js,
@react-three/fiber, drei, GSAP, Zustand, Vite, sharp.
