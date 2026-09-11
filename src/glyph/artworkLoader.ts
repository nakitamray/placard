/**
 * Lazy artwork asset loading with a warm-zone prefetch:
 * glyphs.bin + corpus.bin + meta.json + textures, cached per artwork.
 *
 * What a visit actually costs is decided here, and the rule is that nothing is
 * fetched before somebody has asked for it.
 *
 * A reproduction is pulled only when a reveal asks for one, at the size the
 * canvas is actually drawn (1200px), and upgraded to the full 2000px rung only
 * if the visitor stays with the painting. Until then the 512px corridor
 * texture already in memory stands in, which is a blur-up at no extra request.
 *
 * The warm zone loads the work you are standing in front of immediately and
 * its neighbours when the browser is next idle. Four artworks at once on
 * arrival — four reproductions and four glyph binaries — is what an eager
 * prefetch costs, and it competes with the only thing on screen.
 */
import * as THREE from 'three';
import { loadGlyphs, type GlyphSet } from './loadGlyphs';
import { asset } from '../lib/asset';
import { fallbackUrl, imageUrlAsync, type ImageSize } from '../lib/image';
import type { ArtworkMeta, DeviceTier } from '../types';

export interface LoadedArtwork {
  id: string;
  meta: ArtworkMeta;
  glyphs: GlyphSet;
  corpusTex: THREE.DataTexture;
  corpusLen: number;
  paletteTex: THREE.DataTexture;
  paletteSize: number;
  wallTex: THREE.Texture;
  /** the reproduction, once a reveal has asked for it — null until then */
  fullTex: THREE.Texture | null;
  /** which rung of the ladder fullTex currently holds */
  revealLevel: 'none' | 'view' | 'full';
}

const texLoader = new THREE.TextureLoader();

/* ── the resident set ───────────────────────────────────────────────────── */

/**
 * How many works stay in memory at once.
 *
 * A loaded work is not small: a corpus texture up to 2048 wide, a palette, a
 * wall thumbnail, and — once anybody has looked at it — a 1200 or 2000px
 * reproduction sitting in video memory. Six of those is comfortably more than
 * anything on screen ever needs (the gallery's warm zone holds four, the
 * entrance holds two mid-crossfade) and is a ceiling rather than a target.
 *
 * There was no ceiling before, and the entrance is a carousel: it changes
 * work every fifteen seconds, for as long as somebody leaves the tab open,
 * and every one of those was kept for the life of the page. Ten minutes at
 * the front door was seventy paintings' worth of textures the browser could
 * not reclaim, which is the shape of slowness people describe as "it gets
 * worse the longer I leave it".
 */
const MAX_RESIDENT = 6;

/**
 * How long an unclaimed work is left alone before it can be evicted.
 *
 * Not everything that reads a work holds on to it — Thread Pull asks for the
 * one it is tearing a region out of and lets go the same tick. The grace
 * period means a request in flight, or a component between renders, is never
 * evicted out from under itself; anything longer-lived says so with `retain`.
 */
const GRACE_MS = 10_000;

interface Entry {
  promise: Promise<LoadedArtwork>;
  /** set once the load resolves — null while it is still in flight */
  art: LoadedArtwork | null;
  /** how many mounted components are drawing this work right now */
  refs: number;
  /** when anything last asked for it */
  used: number;
}

const cache = new Map<string, Entry>();

const keyFor = (id: string, tier: DeviceTier) => `${id}${tier.glyphSuffix}`;

/**
 * Hand every GPU resource this work owns back to the driver.
 *
 * Dropping the JavaScript reference is not enough: a THREE texture holds a
 * WebGL object that only `dispose()` releases, and the typed arrays behind
 * the glyph buffers are already on the GPU as attribute data.
 */
function evict(key: string, entry: Entry) {
  cache.delete(key);
  const art = entry.art;
  if (!art) return;
  art.corpusTex.dispose();
  art.paletteTex.dispose();
  art.wallTex.dispose();
  art.fullTex?.dispose();
  // the reproduction ladder is this work's too — leaving it behind would keep
  // the largest texture of the lot alive with nothing left to draw it
  revealCache.delete(`${art.id}/view`);
  revealCache.delete(`${art.id}/full`);
}

/**
 * Drop the least recently used works until the set is back under its ceiling.
 *
 * Nothing held by a mounted component is ever a candidate, and neither is
 * anything still loading — there is nothing to dispose yet, and the promise
 * has somebody waiting on it.
 */
function sweep() {
  if (cache.size <= MAX_RESIDENT) return;
  const now = performance.now();
  const spare = [...cache.entries()]
    .filter(([, e]) => e.refs === 0 && e.art !== null && now - e.used > GRACE_MS)
    .sort((a, b) => a[1].used - b[1].used);
  for (const [key, entry] of spare) {
    if (cache.size <= MAX_RESIDENT) return;
    evict(key, entry);
  }
}

/** Is this the copy of the work the cache is still holding? */
function resident(art: LoadedArtwork): boolean {
  for (const entry of cache.values()) if (entry.art === art) return true;
  return false;
}

/**
 * Keep a work resident for as long as something is drawing it.
 *
 * Call it from the effect that puts the work on screen and call the returned
 * function when that effect tears down — the entrance's two heroes and the
 * gallery's warm zone both do. A work nobody has claimed is fair game for the
 * sweep above; a claimed one cannot be taken away mid-frame.
 */
export function retain(id: string, tier: DeviceTier): () => void {
  const key = keyFor(id, tier);
  // make sure there is something to hold on to, even if the caller retains
  // before it asks for the load
  void loadArtwork(id, tier);
  const entry = cache.get(key);
  if (entry) entry.refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const e = cache.get(key);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    e.used = performance.now();
    sweep();
  };
}

/**
 * Load a texture, stepping down the format ladder if the browser turns out
 * not to decode what it claimed to. The probe in lib/image.ts is reliable, so
 * this is a safety net rather than a normal path.
 */
function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 16;
        resolve(t);
      },
      undefined,
      () => {
        const next = fallbackUrl(url);
        if (next) loadTexture(next).then(resolve, reject);
        else reject(new Error(`texture: ${url}`));
      },
    );
  });
}

/**
 * Just the placard text for a work.
 *
 * The wall label is wanted long before the glyph field is — the corridor
 * raises one under the cursor, and the gallery has one on screen from the
 * moment you arrive. Reading it through `loadArtwork` meant fetching the
 * whole work, glyph binary included, to display five kilobytes of prose:
 * entering any corridor pulled a glyph field nobody had asked to see.
 */
const metaCache = new Map<string, Promise<ArtworkMeta>>();

export function loadMeta(id: string): Promise<ArtworkMeta> {
  let p = metaCache.get(id);
  if (!p) {
    p = fetch(asset(`artworks/${id}/meta.json`)).then((r) => r.json() as Promise<ArtworkMeta>);
    metaCache.set(id, p);
  }
  return p;
}

export function loadArtwork(id: string, tier: DeviceTier): Promise<LoadedArtwork> {
  const key = keyFor(id, tier);
  const hit = cache.get(key);
  if (hit) {
    hit.used = performance.now();
    return hit.promise;
  }

  const p = (async (): Promise<LoadedArtwork> => {
    const base = asset(`artworks/${id}`);
    const [meta, glyphBuf, corpusBuf, wallTex] = await Promise.all([
      loadMeta(id),
      fetch(`${base}/glyphs${tier.glyphSuffix}.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}/corpus.bin`).then((r) => r.arrayBuffer()),
      imageUrlAsync(id, 'wall').then(loadTexture),
    ]);

    const glyphs = loadGlyphs(glyphBuf);

    // corpus → R8 texture, width 2048
    const corpus = new Uint8Array(corpusBuf);
    const cw = 2048;
    const chRows = Math.max(1, Math.ceil(corpus.length / cw));
    const padded = new Uint8Array(cw * chRows);
    padded.set(corpus);
    // pad the tail by repeating from the start so the wrap seam stays text
    for (let i = corpus.length; i < padded.length; i++) padded[i] = corpus[i % corpus.length];
    const corpusTex = new THREE.DataTexture(padded, cw, chRows, THREE.RedFormat);
    corpusTex.minFilter = THREE.NearestFilter;
    corpusTex.magFilter = THREE.NearestFilter;
    corpusTex.needsUpdate = true;

    // palette → sRGB texture (decoded to linear on sample)
    const ps = glyphs.palette.length / 3;
    const pdata = new Uint8Array(ps * 4);
    for (let i = 0; i < ps; i++) {
      pdata[i * 4] = glyphs.palette[i * 3];
      pdata[i * 4 + 1] = glyphs.palette[i * 3 + 1];
      pdata[i * 4 + 2] = glyphs.palette[i * 3 + 2];
      pdata[i * 4 + 3] = 255;
    }
    const paletteTex = new THREE.DataTexture(pdata, ps, 1, THREE.RGBAFormat);
    paletteTex.colorSpace = THREE.SRGBColorSpace;
    paletteTex.minFilter = THREE.NearestFilter;
    paletteTex.magFilter = THREE.NearestFilter;
    paletteTex.needsUpdate = true;

    return {
      id,
      meta,
      glyphs,
      corpusTex,
      corpusLen: corpus.length,
      paletteTex,
      paletteSize: ps,
      wallTex,
      fullTex: null,
      revealLevel: 'none',
    };
  })();

  const entry: Entry = { promise: p, art: null, refs: 0, used: performance.now() };
  cache.set(key, entry);
  void p.then(
    (art) => {
      entry.art = art;
      sweep();
    },
    () => {
      // a failed load is not worth remembering: the next visitor to this work
      // should get a fresh attempt rather than the same rejected promise
      if (cache.get(key) === entry) cache.delete(key);
    },
  );
  return p;
}

/* ── the reproduction ───────────────────────────────────────────────────── */

const revealCache = new Map<string, Promise<THREE.Texture>>();
const RANK: Record<LoadedArtwork['revealLevel'], number> = { none: 0, view: 1, full: 2 };

/**
 * Fetch the painting itself for a work that is being looked at.
 *
 * `view` is the 1200px rung — larger than the canvas is drawn at on any
 * ordinary screen, and a third of the bytes of the 2000px one. `full` is the
 * upgrade, worth asking for once someone has stayed with a work long enough
 * to lean in, and never on a low device tier where the render target is 1024
 * and the extra pixels could not be seen anyway.
 *
 * Both are cached, so a second reveal of the same work costs nothing, and a
 * `view` already in hand is never replaced by anything smaller.
 */
export function loadReveal(
  art: LoadedArtwork,
  size: Extract<ImageSize, 'view' | 'full'>,
): Promise<THREE.Texture | null> {
  if (RANK[art.revealLevel] >= RANK[size]) return Promise.resolve(art.fullTex);
  const key = `${art.id}/${size}`;
  let p = revealCache.get(key);
  if (!p) {
    p = imageUrlAsync(art.id, size).then(loadTexture);
    revealCache.set(key, p);
  }
  return p.then(
    (t) => {
      /*
       * The work may have left while its reproduction was in the air.
       *
       * A 2000px painting is the largest single thing this exhibition
       * downloads, and it can easily still be arriving when the entrance
       * moves on to the next hero and the sweep reclaims the work it belongs
       * to. Handing it to an artwork nothing is drawing any more would leak
       * exactly the texture the resident set exists to bound, so it is
       * disposed on arrival instead.
       */
      if (!resident(art)) {
        t.dispose();
        revealCache.delete(key);
        return art.fullTex;
      }
      // a slower `view` must not overwrite a `full` that landed first
      if (RANK[art.revealLevel] < RANK[size]) {
        art.fullTex = t;
        art.revealLevel = size;
      }
      return art.fullTex;
    },
    () => art.fullTex,
  );
}

/* ── warm zone ──────────────────────────────────────────────────────────── */

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/** run when the browser has nothing better to do, or very soon if it never does */
function whenIdle(fn: () => void) {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 300);
}

/**
 * Prefetch artworks in the warm zone around the rail position.
 *
 * The work in front of the visitor is loaded now; its neighbours wait for an
 * idle moment. Same four artworks either way — but the one that matters is no
 * longer queued behind three that do not.
 */
export function prefetchAround(
  ids: string[],
  index: number,
  tier: DeviceTier,
  onLoad?: (i: number, art: LoadedArtwork) => void,
): () => void {
  let alive = true;
  /*
   * The warm zone is a claim, not just a fetch. Four works are held for as
   * long as the visitor is standing among them, so the resident set cannot
   * evict the one they are looking at to make room for the one behind them.
   */
  const held: Array<() => void> = [];
  const take = (i: number) => {
    held.push(retain(ids[i], tier));
    void loadArtwork(ids[i], tier).then((art) => {
      if (alive) onLoad?.(i, art);
    });
  };
  if (index >= 0 && index < ids.length) take(index);
  whenIdle(() => {
    if (!alive) return;
    for (const di of [1, -1, 2]) {
      const i = index + di;
      if (i >= 0 && i < ids.length) take(i);
    }
  });
  return () => {
    alive = false;
    for (const release of held) release();
  };
}
