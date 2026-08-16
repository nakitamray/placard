/**
 * glyphs.bin — binary format (spec §6). Little-endian.
 *
 * Header (16 bytes):
 *   0  char[4]  magic "PLCD"
 *   4  uint16   version = 1
 *   6  uint16   palette size
 *   8  uint32   glyph count
 *   12 uint16   image width px
 *   14 uint16   image height px
 * Palette: paletteSize × R8 G8 B8 (sRGB)
 * Records: glyphCount × 8 bytes
 *   0 uint16 x        x / imageWidth  * 65535
 *   2 uint16 y        y / imageHeight * 65535
 *   4 uint8  size     quarter-pixels, 0–63.75px
 *   5 uint8  rotation rot / 2π * 255
 *   6 uint8  colorIndex
 *   7 uint8  flags    bit 0 = suppress motion
 *
 * Slot index is implicit: records are stored in corpus reading order.
 */

export const GLYPH_MAGIC = 'PLCD';
export const GLYPH_VERSION = 1;
export const HEADER_BYTES = 16;
export const RECORD_BYTES = 8;

export interface GlyphSet {
  count: number;
  imageW: number;
  imageH: number;
  /** paletteSize × 3, sRGB bytes */
  palette: Uint8Array;
  /** image-space px, xy interleaved */
  pos: Float32Array;
  /** px */
  size: Float32Array;
  /** radians */
  rot: Float32Array;
  cidx: Float32Array;
  slot: Float32Array;
}

export function loadGlyphs(buf: ArrayBuffer): GlyphSet {
  const dv = new DataView(buf);
  if (
    String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !==
    GLYPH_MAGIC
  ) {
    throw new Error('glyphs.bin: bad magic');
  }
  const version = dv.getUint16(4, true);
  if (version !== GLYPH_VERSION) throw new Error(`glyphs.bin: unsupported version ${version}`);
  const paletteSize = dv.getUint16(6, true);
  const count = dv.getUint32(8, true);
  const imageW = dv.getUint16(12, true);
  const imageH = dv.getUint16(14, true);

  let o = HEADER_BYTES;
  const palette = new Uint8Array(buf, o, paletteSize * 3).slice();
  o += paletteSize * 3;

  const pos = new Float32Array(count * 2);
  const size = new Float32Array(count);
  const rot = new Float32Array(count);
  const cidx = new Float32Array(count);
  const slot = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    pos[i * 2] = (dv.getUint16(o, true) / 65535) * imageW;
    pos[i * 2 + 1] = (dv.getUint16(o + 2, true) / 65535) * imageH;
    size[i] = dv.getUint8(o + 4) * 0.25;
    rot[i] = (dv.getUint8(o + 5) / 255) * Math.PI * 2;
    cidx[i] = dv.getUint8(o + 6);
    slot[i] = i;
    o += RECORD_BYTES;
  }
  return { count, imageW, imageH, palette, pos, size, rot, cidx, slot };
}
