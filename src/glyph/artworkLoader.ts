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

const cache = new Map<string, Promise<LoadedArtwork>>();
const texLoader = new THREE.TextureLoader();

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
  const key = `${id}${tier.glyphSuffix}`;
  const hit = cache.get(key);
  if (hit) return hit;

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

  cache.set(key, p);
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
  const take = (i: number) => {
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
  };
}
