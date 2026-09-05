# Placard

A painting is the thing everyone has already seen. What nobody sees is the
weight of writing behind it — the letters, the reviews, the catalogue entries,
the arguments. So the paintings here are built out of that writing: every
stroke on every canvas is a character from a text about that work, moving
through the corpus in reading order. Hold the cursor still and the picture
resolves out of its own words.

Six museums, ten works each, each corridor modelled on the real room it is
named after. Navigation is spatial: **entrance → corridor → floor plan →
gallery rail → one painting**.

Requires WebGL2. Sound is off until you turn it on.

---

# Visiting

## The six rooms

| Museum | The corridor |
|---|---|
| **Musée du Louvre** | white barrel vault pierced by arched skylights, thick classical moulding, deep blue-grey walls, salon hang stacked to the cornice |
| **The British Museum** | crimson walls under a pitched glass lantern on gilded archways, polished light wood, tufted leather seating |
| **Vatican Museums** | frescoed vault in deeply carved gilded stucco, map panels between gilded pilasters, marble inlay, crystal chandeliers |
| **Galleria degli Uffizi** | a flat ceiling of dark crossbeams over grotesque frescoes, daylight down one whole side, a diagonal checkerboard floor, brass stanchions and red rope |
| **Musée d'Orsay** | the colossal arched steel-and-glass nave, stone terraces behind glass railings, the great gilded clock closing the far end |
| **The Metropolitan Museum of Art** | a sunlit court under a peaked skylight: red brick and white voussoired arches one side, marble ashlar the other, a glass wall at the end |

The British Museum corridor follows **Room 32 at the National Gallery,
London** — the Julia and Hans Rausing Room — rather than a British Museum
gallery. The collection hung in it is the British Museum's own painted
holdings, which are prints, frescoes, scrolls and painted papyri rather than
gallery canvases, and no British Museum room shows them the way this one does.
`corridorNote` in `data/museums/british-museum.json` says so too.

## Moving through it

The controls are stated in the interface as well, on a quiet scrim along the
bottom of the screen.

| Where | Input | What happens |
|---|---|---|
| Entrance | click a museum | fetches that wing and walks you into its corridor |
| Corridor | move the mouse | look around — wide enough to face either wall |
| Corridor | <kbd>↑</kbd> <kbd>↓</kbd> | walk forward and back; a tap is a step, a hold is a stride |
| Corridor | <kbd>Shift</kbd> or <kbd>Enter</kbd> | hurry to the far end |
| Corridor | wheel, drag | also moves along the rail |
| Corridor | click a canvas | walk straight into that painting's room |
| Floor plan | click a room | choose a painter and warp into their room |
| Gallery | wheel, <kbd>←</kbd> <kbd>→</kbd> | move between paintings, with a magnetic snap |
| Gallery | move over a painting | the **reading lens** — a soft circle where the words give way and the paint shows through |
| Gallery | click, or <kbd>Enter</kbd> | the whole work dissolves out of its text and the wall label arrives |
| Gallery | <kbd>space</kbd>, or the **Threads** toggle | **Thread Pull** — the canvas becomes a map of its own passages |
| Anywhere | <kbd>+</kbd> <kbd>−</kbd>, ⌘/Ctrl-scroll, pinch | zoom: a longer lens in the corridor, a step closer in a room |
| Anywhere | <kbd>0</kbd> | back to the distance the room was composed for |
| Anywhere | <kbd>Esc</kbd> | step back one level |

<kbd>Esc</kbd> walks the whole way out: painting → gallery → floor plan →
corridor → entrance.

**Hover looks, click decides.** Moving over a canvas opens the reading lens and
nothing else: the room does not slide, the label does not arrive, the work does
not dissolve out from under you. Clicking is the decision.

**The corridor lights one work at a time.** Bringing the cursor onto a canvas
drops the room's exposure and brings a narrow warm spot up on that painting,
which is how a gallery is actually lit, and what makes a wall of sixty
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
minutes, because sixty works are each analysed into a glyph field twice.

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
  ui/                       everything in the DOM over the canvas
  state/                    one store for the room, one for the atlas
  lib/                      audio, music, images, quality, device tiering
shared/                     types shared between the build and the runtime
```

## Authoring

Adding a museum is two files and a line in `order.json`. Adding a work is one
record.

A **museum record** carries a `style` block that drives the entire corridor:
`ceiling`, `floor`, `wall` and `frame` kinds, room proportions, a ten-colour
palette, a full lighting rig (key colour, intensity and direction; sky and
ground fill; lamp colour; tone-mapping exposure; background and fog) and which
fixtures to place — sculpture, seating, chandeliers, label stands, a clock,
terraces. Nothing about a particular building is hard-coded in the renderer.

An **artwork record** carries the placard (artist, dates, title, year, medium,
dimensions, room, accession, credit line, wall label, extended note), the
painter's `accentColor`, an optional `heroFocus`, a `placeholder` spec, and
optionally hand-authored Thread Pull `regions`.

`heroFocus` is `[x, y]` in normalised image coordinates with y down, and it
matters in exactly one place: the entrance is the only screen that crops a
painting, and a centred crop of a tall canvas throws away the face. Omit it and
a tall work is held a little above centre and everything else in the middle.

`frameShape` handles the works a rectangle is wrong for. `'round'` turns the
museum's own moulding on a lathe and cuts the canvas to a circle, for a tondo;
`'divided'` keeps the rectangle and runs a moulded bar down the centre, for a
pair of panels hung as one object. Omitted, a work takes the museum's plain
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
dimensions and how it was resolved. Sixty works is too many to check by
clicking through sixty Commons pages, and not checking is how an exhibition
ends up hanging a photograph of a frame. Each card carries a **pin this** block
to paste straight into `data/image-sources.json`:

```json
"manet-olympia": { "commonsFile": "File:Edouard Manet - Olympia - Google Art Project 3.jpg" }
```

Changing a pin is enough on its own — a scan that came from a different file is
treated as stale and re-fetched without `--force`. `pnpm fetch:images --check`
lists every work in that state.

A few entries need judgement rather than search: the Fayum portrait and John
White's album are whole classes of object rather than one work, the Admonitions
Scroll is long enough that you want a specific section, and several Van Gogh
and Monet subjects exist in many versions. Each of those carries a `note` in
`data/image-sources.json`.

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
`three` (~192 kB gzip) changes only on a dependency upgrade, the app itself
(~50 kB gzip) every time a placard is edited.

## Deploying

`.github/workflows/deploy.yml` fetches the paintings, builds the assets and
publishes on every push to `main`. Turn it on with **Settings → Pages →
Source: GitHub Actions**; the site lands at `https://<user>.github.io/<repo>/`.

Two caches carry the cost across runs:

| Cache | Keyed on | Effect |
|---|---|---|
| Fetched scans | `data/image-sources.json`, `data/collections/*` | Wikimedia is hit once, not on every deploy |
| Built assets | `data/**`, `scripts/**`, `shared/**` | editing one placard rebuilds that work and reuses the other 49 |

A cold first run is around ten minutes; later ones are usually under two.
`workflow_dispatch` has a **refetch** checkbox for pulling the paintings again
deliberately. The image fetch is `continue-on-error`, so an unreachable Commons
falls back to stand-ins rather than failing the deploy.

**Serving from a subpath.** Every generated-asset URL goes through
`src/lib/asset.ts`, which prefixes Vite's `BASE_URL`:

```bash
BASE_PATH=/placard/ pnpm build   # GitHub Pages project site
pnpm build                        # domain root — Vercel, Netlify, S3
```

The workflow sets it from the repository name; override it with a `BASE_PATH`
repository variable for a custom domain (use `/`).

`vercel.json` also works — its build command runs `build:assets && build`. Add
`fetch:images` to it if you want Vercel to pull the paintings too, but it has
no persistent `data/artworks` cache between builds, so it re-downloads every
time.

## Contact form

The **About** tab of the Colophon carries a three-field form. Out of the box it
composes a `mailto:` to `VITE_CONTACT_EMAIL` and hands it to the visitor's own
mail client — no account anywhere, works the moment it ships. To have messages
arrive without the visitor needing a mail client, point one environment
variable at a form endpoint (Formspree, Getform, Basin, or a function of your
own) and the form POSTs JSON to it instead:

```
VITE_CONTACT_ENDPOINT=https://formspree.io/f/xxxxxxxx
```

Vite inlines `VITE_`-prefixed variables at build time, so a change needs a
redeploy.

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
