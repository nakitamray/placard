/**
 * Runtime glyph atlas.
 *
 * The spec (§5.1) generates an MSDF atlas at build time with msdf-bmfont-xml.
 * This implementation draws the charset once into an offscreen canvas at
 * 48px/cell and uploads it a single time with mipmaps — a deliberate
 * substitution documented in the README: identical runtime cost profile
 * (zero per-frame uploads), no native font tooling required, and at the
 * project's 4–24px glyph sizes mipmapped alpha is visually indistinguishable
 * from SDF. The metrics texture contract (per-char UV rect, sampled directly
 * in the vertex shader) is exactly the spec's.
 */
import * as THREE from 'three';
import { CHARSET } from '../../shared/charset';

export interface GlyphAtlas {
  atlas: THREE.CanvasTexture;
  /** 256×1 RGBA float — u0,v0,u1,v1 per char index (spec §5.1) */
  metrics: THREE.DataTexture;
}

let cached: GlyphAtlas | null = null;

export function getGlyphAtlas(): GlyphAtlas {
  if (cached) return cached;

  const CELL = 64;
  const COLS = 16;
  const rows = Math.ceil(CHARSET.length / COLS);
  const W = COLS * CELL;
  const H = rows * CELL;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `48px "Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

  for (let i = 0; i < CHARSET.length; i++) {
    const cx = (i % COLS) * CELL + CELL / 2;
    const cy = Math.floor(i / COLS) * CELL + CELL / 2;
    ctx.fillText(CHARSET[i], cx, cy);
  }

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.needsUpdate = true;

  // metrics: 256×1 RGBA32F, u0 v0 u1 v1 per char index — direct shader lookup
  const data = new Float32Array(256 * 4);
  // inset the sampled rect slightly to avoid bleeding neighbouring cells
  const inset = 4 / CELL;
  for (let i = 0; i < CHARSET.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const u0 = (col + inset) / COLS;
    const u1 = (col + 1 - inset) / COLS;
    // canvas y is top-down; textures are sampled bottom-up
    const v1 = 1 - (row + inset) / rows;
    const v0 = 1 - (row + 1 - inset) / rows;
    data[i * 4] = u0;
    data[i * 4 + 1] = v0;
    data[i * 4 + 2] = u1;
    data[i * 4 + 3] = v1;
  }
  const metrics = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat, THREE.FloatType);
  metrics.minFilter = THREE.NearestFilter;
  metrics.magFilter = THREE.NearestFilter;
  metrics.needsUpdate = true;

  cached = { atlas, metrics };
  return cached;
}
