# Applying `placard-iteration-4.bundle`

A git bundle is a single file containing real git history. You pull from it
exactly as you would from a remote, so nothing is overwritten without you
asking and every commit keeps its authorship.

**This bundle contains three commits**, on the branch
`claude/project-iteration-one-ui-1fzn9d`, on top of the commit your repository
is already on (`37a67ad`). It carries the complete history, so it works against
an existing clone *or* on a machine with no clone at all.

---

## Option A — you already have the repo (recommended)

From inside your `placard` checkout:

```bash
# 1. sanity check: this should print 37a67ad...
git log --oneline -1

# 2. pull the branch out of the bundle
git fetch /full/path/to/placard-iteration-4.bundle \
  claude/project-iteration-one-ui-1fzn9d:iteration-4

# 3. look before you leap
git log --oneline iteration-4
git diff --stat HEAD iteration-4
```

That leaves a new local branch called `iteration-4` and changes nothing else.
When you are happy with it:

```bash
git checkout iteration-4
```

To put it on your own branch name instead, replace `iteration-4` in step 2 with
whatever you want to call it.

**To push it to GitHub yourself** (this session was not permitted to push):

```bash
git push -u origin iteration-4
```

## Option B — fresh machine, no clone

```bash
git clone placard-iteration-4.bundle placard
cd placard
git checkout claude/project-iteration-one-ui-1fzn9d
```

Then point it at your real remote:

```bash
git remote set-url origin https://github.com/nakitamray/placard
```

---

## After applying, in either case

```bash
pnpm install
pnpm build:assets     # a few minutes — 50 works, each analysed twice
pnpm dev
```

`pnpm build:assets` is **required**, not optional. It regenerates
`public/artworks`, `public/landing` and `public/museums` from `data/`, and none
of those are committed. Without it the landing page will tell you it found no
museums.

If `sharp` fails to install its binaries, run `pnpm approve-builds` once and
reinstall.

To check it end to end:

```bash
pnpm build && pnpm preview
```

---

## What is in these commits

### 1 — Five museums, ten works each

**Five museums, ten works each** — the Louvre, the British Museum, the Vatican,
the Musée d'Orsay and the Met — replacing the single gallery of five.

- **Corridors** are now generated from a per-museum style record: ceiling,
  floor, wall treatment, fixtures, palette, lighting rig and exposure. Each of
  the five is modelled on the room you referenced.
- **Frames** are compound mouldings — concentric extruded, bevelled courses
  with bead courses, corner cartouches, reeding, or a full architectural
  tabernacle — in five per-museum styles, instead of one flat gilt box.
- **Paintings are centred** in their mouldings rather than sitting at the
  bottom of them, and very wide works give up height instead of colliding with
  their neighbours.
- **The artwork room** is rebuilt: each canvas sits in a full moulded bay
  (fluted pilasters, entablature, cornice, dentils, raised panel, coffer) and
  the whole room takes the painter's identifying colour, easing from one
  painter to the next as you move along the rail.
- **The cursor** is visible again — it was dark-on-dark and vanished on the
  landing page and in the corridor.
- **The controls are stated** in the softest type in the system along the
  bottom of the screen, in the corridor, on the floor plan and in the gallery.

### 2 — Daylight, sculpture and legibility

- **The Met is a day room.** Bright key light, glazed ceiling, higher exposure,
  pale palette — it was lit for dusk, which made the one museum whose reference
  is full of sunlight the darkest room in the exhibition. Its skylight is
  rebuilt to your reference: a glazed peak on a fine grid of white glazing
  bars, flat glazing out to each wall, purlins, a ridge and a truss per bay.
  The corridor ends in a floor-to-ceiling window rather than brick, and no
  sculpture stands in it — that room hangs paintings.
- **Four classical statue types** replace the single capsule on a plinth:
  draped standing female, contrapposto male nude, seated philosopher, orator
  with a raised arm, distributed round the museums that place figures. Roman
  portrait busts rebuilt around the cut that identifies them.
- **The interface is readable.** Control hints, museum name and back control
  sit on their own scrim at 12px, so they hold against a white marble floor and
  a black vault alike.
- **The landing page shows all five museums.** It centred itself with a
  transform that the parallax loop overwrote every frame, dropping the block
  half its height and pushing the last two museums off the bottom of the
  screen — which is why zooming out appeared to fix it.
- **Entering a museum resets you to the start of its corridor.** Corridor
  position lives outside React, so the second museum you visited dropped you
  wherever you left the first.
- Both pitched roofs were being built as valleys rather than gables.

### 3 — The Met facades, atmosphere, and opening works from the corridor

- **Both Met walls rebuilt as masonry**: coursed brick with staggered
  perpends, marble ashlar, arches built from voussoirs around a keystone over
  a recessed reveal, engaged columns with base/shaft/necking/capital, string
  courses, an entablature with dentils, and warm sconces washing the brick
  against the cool daylight. The stick-figure rings are gone.
- **Air in every room**: shafts of light leaning out of the skylights, and
  dust drifting up through them.
- **Click a painting in the corridor to enter its room.** Hovering lifts and
  warms the canvas and raises a wall label under the cursor.
- **Softer scrims** behind the hints, museum name and back control.

Full detail, including the authoring format and the five style records, is in
`README.md`.

## One thing to know before you show it

48 of the 50 works are **procedurally generated stand-ins**, not authentic
scans. The environment this was built in had no network access to Wikimedia
Commons. Two works — *Starry Night Over the Rhône* and *Whistler's Mother* —
have real scans and show what it looks like with real material.

Dropping in a real painting is one step:

1. Save the scan as `data/artworks/{id}/source.jpg` (create the folder; the ids
   are the `id` fields in `data/collections/*.json`).
2. `pnpm build:assets`.

The build prefers `source.jpg` automatically and prints how many works are
still on stand-ins. Nothing else changes — the same pipeline, the same
corridors, the same placards.
