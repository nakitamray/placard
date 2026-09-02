/**
 * build-glyphs.ts — spec §4.2 / §5.3
 *
 * Quadtree variance subdivision over the source image, emitting glyphs.bin
 * (format in §6 / shared/glyphFormat.ts) plus a preview PNG for fast
 * art-direction iteration.
 *
 * Chosen over Poisson-disk or rejection sampling because it is deterministic,
 * fast, gives clean size tiers, and guarantees full coverage with no gaps.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, artworkPublic } from './lib/paths.ts';
import { GLYPH_MAGIC, GLYPH_VERSION, HEADER_BYTES, RECORD_BYTES } from '../shared/glyphFormat.ts';
import type { GlyphConfig } from './lib/records.ts';

interface Emitted {
  x: number;
  y: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

// ---------- colour helpers (averaging happens in LINEAR space, spec §4.2) ----------

const srgbToLinearLUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  srgbToLinearLUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

// ---------- summed-area tables ----------

class SAT {
  private t: Float64Array;
  constructor(
    private w: number,
    private h: number,
    values: Float32Array,
  ) {
    this.t = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += values[y * w + x];
        this.t[(y + 1) * (w + 1) + (x + 1)] = this.t[y * (w + 1) + (x + 1)] + row;
      }
    }
  }
  sum(x0: number, y0: number, x1: number, y1: number): number {
    const w1 = this.w + 1;
    return (
      this.t[y1 * w1 + x1] - this.t[y0 * w1 + x1] - this.t[y1 * w1 + x0] + this.t[y0 * w1 + x0]
    );
  }
}

// ---------- median-cut palette quantisation ----------

function medianCut(colors: Array<[number, number, number]>, target: number): Uint8Array {
  type Box = { items: Array<[number, number, number]> };
  let boxes: Box[] = [{ items: colors }];
  while (boxes.length < target) {
    // split the box with the largest channel range
    let bi = -1;
    let bc = 0;
    let br = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].items.length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let mn = 255;
        let mx = 0;
        for (const it of boxes[i].items) {
          if (it[c] < mn) mn = it[c];
          if (it[c] > mx) mx = it[c];
        }
        if (mx - mn > br) {
          br = mx - mn;
          bi = i;
          bc = c;
        }
      }
    }
    if (bi < 0 || br <= 0) break;
    const box = boxes[bi];
    box.items.sort((a, b) => a[bc] - b[bc]);
    const mid = box.items.length >> 1;
    boxes.splice(bi, 1, { items: box.items.slice(0, mid) }, { items: box.items.slice(mid) });
  }
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((box, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const it of box.items) {
      r += it[0];
      g += it[1];
      b += it[2];
    }
    const n = Math.max(1, box.items.length);
    palette[i * 3] = Math.round(r / n);
    palette[i * 3 + 1] = Math.round(g / n);
    palette[i * 3 + 2] = Math.round(b / n);
  });
  return palette;
}

function nearestPaletteIndex(palette: Uint8Array, r: number, g: number, b: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i * 3 < palette.length; i++) {
    const dr = palette[i * 3] - r;
    const dg = palette[i * 3 + 1] - g;
    const db = palette[i * 3 + 2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// ---------- main per-artwork build ----------

/**
 * Build glyphs.bin for one work.
 *
 * `overrides` lets the caller build a coarser variant of the same painting
 * from the same source — that is how the low device tier's glyphs-lo.bin is
 * produced.
 */
export async function buildGlyphs(
  id: string,
  sourcePath: string,
  cfg: GlyphConfig,
  suffix = '',
  overrides: Partial<GlyphConfig> = {},
) {
  const conf: GlyphConfig = { ...cfg, ...overrides };

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${id}: no source image at ${sourcePath} — run build-images first`);
  }

  const img = sharp(sourcePath).resize({ width: conf.workingWidth });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;

  // luminance in linear space
  const lum = new Float32Array(W * H);
  const linR = new Float32Array(W * H);
  const linG = new Float32Array(W * H);
  const linB = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = srgbToLinearLUT[data[i * ch]];
    const g = srgbToLinearLUT[data[i * ch + 1]];
    const b = srgbToLinearLUT[data[i * ch + 2]];
    linR[i] = r;
    linG[i] = g;
    linB[i] = b;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const lum2 = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum2[i] = lum[i] * lum[i];

  const satL = new SAT(W, H, lum);
  const satL2 = new SAT(W, H, lum2);
  const satR = new SAT(W, H, linR);
  const satG = new SAT(W, H, linG);
  const satB = new SAT(W, H, linB);

  /** one quadtree pass at a given cell floor, ceiling and detail threshold */
  const subdivide = (minCell: number, maxCell: number, varianceThreshold: number): Emitted[] => {
    const out: Emitted[] = [];

    const emit = (x0: number, y0: number, x1: number, y1: number) => {
      const n = (x1 - x0) * (y1 - y0);
      if (n <= 0) return;
      // mean colour in LINEAR space, then re-encode (spec §4.2)
      let r = satR.sum(x0, y0, x1, y1) / n;
      let g = satG.sum(x0, y0, x1, y1) / n;
      let b = satB.sum(x0, y0, x1, y1) / n;
      // saturation boost around the luminance axis, still in linear space
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * conf.saturationBoost;
      g = l + (g - l) * conf.saturationBoost;
      b = l + (b - l) * conf.saturationBoost;
      // contrast boost around mid-grey
      const mid = 0.18;
      r = mid + (r - mid) * conf.contrastBoost;
      g = mid + (g - mid) * conf.contrastBoost;
      b = mid + (b - mid) * conf.contrastBoost;
      out.push({
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        size: Math.min(63.75, (x1 - x0) * conf.fontScale),
        r: linearToSrgb(Math.max(0, r)),
        g: linearToSrgb(Math.max(0, g)),
        b: linearToSrgb(Math.max(0, b)),
      });
    };

    // quadtree — iterative queue (spec §4.2)
    const queue: Array<[number, number, number, number]> = [[0, 0, W, H]];
    while (queue.length) {
      const [x0, y0, x1, y1] = queue.pop()!;
      const size = Math.max(x1 - x0, y1 - y0);
      if (size <= minCell) {
        emit(x0, y0, x1, y1);
        continue;
      }
      const n = (x1 - x0) * (y1 - y0);
      const mean = satL.sum(x0, y0, x1, y1) / n;
      const variance = Math.max(0, satL2.sum(x0, y0, x1, y1) / n - mean * mean);
      if (variance > varianceThreshold || size > maxCell) {
        const mx = (x0 + x1) >> 1;
        const my = (y0 + y1) >> 1;
        // guard degenerate splits on non-square roots
        if (mx > x0 && my > y0) {
          queue.push([x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]);
        } else if (mx > x0) {
          queue.push([x0, y0, mx, y1], [mx, y0, x1, y1]);
        } else if (my > y0) {
          queue.push([x0, y0, x1, my], [x0, my, x1, y1]);
        } else {
          emit(x0, y0, x1, y1);
        }
      } else {
        emit(x0, y0, x1, y1);
      }
    }
    return out;
  };

  /**
   * Hold the glyph count to a budget.
   *
   * The count is what the visitor pays for twice over: eight bytes each down
   * the wire, and one instance each in the draw that animates them. A smooth
   * stand-in bottoms out on `maxCell` and lands around sixteen thousand, but a
   * real scan — canvas weave, craquelure, a crowd scene — keeps finding
   * variance all the way down to `minCell` and can emit four times that from
   * the same image. Left alone, swapping in the authentic paintings would have
   * quietly quadrupled both the payload and the per-frame cost.
   *
   * So: raise the cell floor and re-run until the count fits. The summed-area
   * tables are already built, so each extra pass is a few milliseconds, and
   * the result degrades the way you would want — the finest strokes coarsen
   * first, the composition survives.
   */
  let minCell = conf.minCell;
  let maxCell = conf.maxCell;
  let threshold = conf.varianceThreshold;
  let emitted = subdivide(minCell, maxCell, threshold);
  let passes = 0;
  while (emitted.length > conf.maxGlyphs && passes < 12) {
    if (passes < 8) {
      // Raise the detail threshold first. This is the gentle knob: it stops
      // the quadtree chasing variance into the flattest parts of the canvas —
      // sky, a wall, a dark ground — and leaves the faces and the brushwork
      // exactly as they were.
      threshold *= 1.7;
    } else {
      // Only if that has not been enough, coarsen the cells themselves. Each
      // doubling quarters the count, which is blunt, hence its being last.
      minCell *= 2;
      if (minCell > maxCell) maxCell *= 2;
    }
    emitted = subdivide(minCell, maxCell, threshold);
    passes++;
  }

  // sort row-major: y band (by maxCell), then x — CORPUS READING ORDER (spec §4.2)
  const band = maxCell;
  emitted.sort((a, b) => {
    const ba = Math.floor(a.y / band);
    const bb = Math.floor(b.y / band);
    return ba !== bb ? ba - bb : a.x - b.x;
  });

  // palette: quantise emitted colours via median-cut (spec §4.2 step 7)
  const palette = medianCut(
    emitted.map((e) => [e.r, e.g, e.b] as [number, number, number]),
    conf.paletteSize,
  );
  const paletteSize = palette.length / 3;

  // emit binary (spec §6)
  const buf = Buffer.alloc(HEADER_BYTES + paletteSize * 3 + emitted.length * RECORD_BYTES);
  buf.write(GLYPH_MAGIC, 0, 'ascii');
  buf.writeUInt16LE(GLYPH_VERSION, 4);
  buf.writeUInt16LE(paletteSize, 6);
  buf.writeUInt32LE(emitted.length, 8);
  buf.writeUInt16LE(W, 12);
  buf.writeUInt16LE(H, 14);
  Buffer.from(palette).copy(buf, HEADER_BYTES);

  let o = HEADER_BYTES + paletteSize * 3;
  for (const e of emitted) {
    buf.writeUInt16LE(Math.round((e.x / W) * 65535), o);
    buf.writeUInt16LE(Math.round((e.y / H) * 65535), o + 2);
    buf.writeUInt8(Math.min(255, Math.round(e.size * 4)), o + 4);
    buf.writeUInt8(0, o + 5); // rotation — flow fields deferred (spec §18.2)
    buf.writeUInt8(nearestPaletteIndex(palette, e.r, e.g, e.b), o + 6);
    buf.writeUInt8(0, o + 7);
    o += RECORD_BYTES;
  }

  const outDir = artworkPublic(id);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `glyphs${suffix}.bin`);
  fs.writeFileSync(outFile, buf);

  // preview PNG (spec §5.3) — coloured rects standing in for glyphs; the
  // fastest iteration loop for tuning config.json before touching the runtime
  if (!suffix) {
    const rects = emitted
      .map(
        (e) =>
          `<rect x="${(e.x - e.size / 2).toFixed(1)}" y="${(e.y - e.size / 2).toFixed(1)}" ` +
          `width="${e.size.toFixed(1)}" height="${e.size.toFixed(1)}" ` +
          `fill="rgb(${e.r},${e.g},${e.b})"/>`,
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#111"/>${rects}</svg>`;
    const previewDir = path.join(CACHE, 'previews');
    fs.mkdirSync(previewDir, { recursive: true });
    await sharp(Buffer.from(svg)).png().toFile(path.join(previewDir, `${id}.png`));
  }

  console.log(
    `  glyphs${suffix || '   '}  ${emitted.length} glyphs, ${paletteSize} colours, ` +
      `${(buf.length / 1024).toFixed(0)} KB (${W}×${H})` +
      (passes ? `  [coarsened ${passes}× to fit ${conf.maxGlyphs}]` : ''),
  );
  return emitted.length;
}
