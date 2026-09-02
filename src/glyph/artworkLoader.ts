/**
 * Lazy artwork asset loading with a warm-zone prefetch (spec §7.5):
 * glyphs.bin + corpus.bin + meta.json + textures, cached per artwork.
 */
import * as THREE from 'three';
import { loadGlyphs, type GlyphSet } from './loadGlyphs';
import { asset } from '../lib/asset';
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
  fullTex: THREE.Texture | null; // resolves lazily; lqip-first blur-up
}

const cache = new Map<string, Promise<LoadedArtwork>>();
const texLoader = new THREE.TextureLoader();

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

export function loadArtwork(id: string, tier: DeviceTier): Promise<LoadedArtwork> {
  const key = `${id}${tier.glyphSuffix}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<LoadedArtwork> => {
    const base = asset(`artworks/${id}`);
    const [meta, glyphBuf, corpusBuf, wallTex] = await Promise.all([
      fetch(`${base}/meta.json`).then((r) => r.json() as Promise<ArtworkMeta>),
      fetch(`${base}/glyphs${tier.glyphSuffix}.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}/corpus.bin`).then((r) => r.arrayBuffer()),
      loadTexture(`${base}/wall.jpg`),
    ]);

    const glyphs = loadGlyphs(glyphBuf);

    // corpus → R8 texture, width 2048 (spec §5.2)
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

    const loaded: LoadedArtwork = {
      id,
      meta,
      glyphs,
      corpusTex,
      corpusLen: corpus.length,
      paletteTex,
      paletteSize: ps,
      wallTex,
      fullTex: null,
    };

    // full-resolution reveal image resolves in the background (blur-up, §10C.8)
    loadTexture(`${base}/full.jpg`).then((t) => {
      loaded.fullTex = t;
    });

    return loaded;
  })();

  cache.set(key, p);
  return p;
}

/** Prefetch artworks in the warm zone around the rail position (spec §7.5). */
export function prefetchAround(ids: string[], index: number, tier: DeviceTier) {
  for (const di of [0, 1, -1, 2]) {
    const i = index + di;
    if (i >= 0 && i < ids.length) void loadArtwork(ids[i], tier);
  }
}
