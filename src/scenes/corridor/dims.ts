import type { MuseumStyle } from '../../types';

/** Resolved corridor geometry — every part reads its dimensions from here. */
export interface Dims {
  halfWidth: number;
  wallHeight: number;
  vaultHeight: number;
  bays: number;
  bayDepth: number;
  /** total run of the corridor, metres */
  length: number;
  /** z of the terminal wall, which is where the map transition fires */
  apseZ: number;
}

export function dimsFor(style: MuseumStyle): Dims {
  const length = style.bays * style.bayDepth;
  return {
    halfWidth: style.halfWidth,
    wallHeight: style.wallHeight,
    vaultHeight: style.vaultHeight,
    bays: style.bays,
    bayDepth: style.bayDepth,
    length,
    apseZ: -(length + style.bayDepth * 0.7),
  };
}

/** centre-line z of bay `b` */
export const bayZ = (d: Dims, b: number) => -(b * d.bayDepth + d.bayDepth / 2);

/**
 * The hanging line: the height every painting in the corridor is centred on.
 *
 * A gallery hangs to a shared centre, not a shared bottom edge — that is what
 * makes an uneven row of canvases read as one continuous wall. The wall panel
 * behind each work is centred on the same line, so a painting always sits in
 * the middle of its moulding rather than sinking to the bottom of it.
 */
export const hangHeight = (d: Dims) => Math.min(2.1, d.wallHeight * 0.44);
