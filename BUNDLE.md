# Applying `placard-iteration-6.bundle`

A git bundle is a single file containing real git history. You pull from it
exactly as you would from a remote, so nothing is overwritten without you
asking and every commit keeps its authorship.

**This bundle contains five commits**, on the branch
`claude/project-iteration-one-ui-1fzn9d`, on top of the commit your repository
is already on (`37a67ad`). It carries the complete history, so it works against
an existing clone *or* on a machine with no clone at all.

---

## Option A — you already have the repo (recommended)

From inside your `placard` checkout:

```bash
# 1. sanity check: this should print 37a67ad...
git log --oneline -1

# 2. pull the branch out of the bundle — ONE line, no line continuation
git fetch /full/path/to/placard-iteration-6.bundle claude/project-iteration-one-ui-1fzn9d:iteration-6

# 3. look before you leap
git log --oneline iteration-6
git diff --stat HEAD iteration-6
```

On Windows, quote the path and keep the fetch on one line — PowerShell reads a
trailing `\` as a literal argument, not as a line continuation, and git then
rejects it with `fatal: invalid refspec '\'`:

```powershell
git fetch "C:\Users\you\Downloads\placard-iteration-6.bundle" claude/project-iteration-one-ui-1fzn9d:iteration-6
```

That leaves a new local branch called `iteration-6` and changes nothing else.
When you are happy with it:

```bash
git checkout iteration-6
```

To put it on your own branch name instead, replace `iteration-6` in step 2 with
whatever you want to call it.

**To push it to GitHub yourself** (this session was not permitted to push):

```bash
git push -u origin iteration-6
```

## Option B — fresh machine, no clone

```bash
git clone placard-iteration-6.bundle placard
cd placard
git checkout claude/project-iteration-one-ui-1fzn9d
```

Then point it at your real remote:

```bash
git remote set-url origin https://github.com/nakitamray/placard
```

---

## After applying, in either case

**If you just want it hosted, you do not need to run any of this.** Push the
branch to `main`, turn on **Settings → Pages → Source: GitHub Actions**, and
the included workflow fetches the paintings, builds the assets and publishes
the site. See *5* below.

To run it locally:

```bash
pnpm install
pnpm fetch:images --dry   # see which painting it found for each work
pnpm fetch:images         # download them all from Wikimedia Commons
pnpm build:assets         # a few minutes — 50 works, each analysed twice
pnpm dev
```

`pnpm fetch:images` is the one that saves you the manual work: it pulls all 48
missing paintings from Wikimedia Commons and records the licence and author for
each. Run `--dry` first and read the table — search occasionally picks the
wrong picture, and anything wrong can be pinned by exact file name in
`data/image-sources.json`. Full detail in the README under **Artwork images**.

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

### 4 — Fetching the paintings automatically

`pnpm fetch:images` pulls all 48 missing paintings from Wikimedia Commons, so
you never have to find and import them by hand. It writes each scan to
`data/artworks/{id}/source.jpg` and records the exact Commons file, licence and
author alongside it, which `build:assets` then publishes onto the placard.

**This could not be run or verified from the environment it was written in** —
Wikimedia is blocked there by network policy, so the first real run will be on
your machine or on a CI runner. Everything up to the network call is tested,
including the candidate scoring; the network path is not. Run `--dry` first,
read the table, and pin anything wrong by exact file name in
`data/image-sources.json`.

### 5 — Fast enough to host, and built in CI

Measured before: **951 draw calls and 425k triangles per frame** at the Met,
912 and **1.31M** at the Louvre. Both several times what this room should cost.

- **Three rendering budgets** — Smooth, Balanced, Rich — picked from the device
  and overridable by the visitor from the control bottom-right. The Louvre goes
  from 912 draws / 1.31M triangles to **355 / 58k** on Smooth.
- The mirrored floor was the single biggest cost: it renders the entire scene a
  second time. It is now Rich only.
- Carved frame ornament is built only for the nearest few bays. Auto-detection
  never picks Rich, and a watchdog steps the budget down if real frame times
  are bad.
- **Three genuine bugs**: the instancing helpers had no dependency array, so
  every brick, rib and voussoir matrix was rewritten on every React render;
  wall textures were being loaded twice per museum; ornament was casting into
  the shadow map.
- **The bundle is split** so the renderer (192kB gzip) caches separately from
  the exhibition (~30kB gzip).
- **`.github/workflows/deploy.yml`** fetches, builds and publishes to GitHub
  Pages on push, with caches so Wikimedia is hit once and editing one placard
  rebuilds one work. Nothing heavy runs on your laptop.
- Asset URLs were absolute and would have 404'd from any subpath; they now go
  through `BASE_PATH`. Verified in a browser against a `/placard/` build.
