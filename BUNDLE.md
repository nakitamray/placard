# Applying `placard-iteration-2.bundle`

A git bundle is a single file containing real git history. You pull from it
exactly as you would from a remote, so nothing is overwritten without you
asking and every commit keeps its authorship.

**This bundle contains one commit**, on the branch
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
git fetch /full/path/to/placard-iteration-2.bundle \
  claude/project-iteration-one-ui-1fzn9d:iteration-2

# 3. look before you leap
git log --oneline iteration-2
git diff --stat HEAD iteration-2
```

That leaves a new local branch called `iteration-2` and changes nothing else.
When you are happy with it:

```bash
git checkout iteration-2
```

To put it on your own branch name instead, replace `iteration-2` in step 2 with
whatever you want to call it.

**To push it to GitHub yourself** (this session was not permitted to push):

```bash
git push -u origin iteration-2
```

## Option B — fresh machine, no clone

```bash
git clone placard-iteration-2.bundle placard
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

## What is in this commit

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
