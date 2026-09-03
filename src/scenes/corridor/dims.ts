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

/**
 * The tallest a corridor work is allowed to be, per hang pattern. `Bays` in
 * CorridorScene fits every canvas inside this, so anything that has to reason
 * about where the pictures end reads it from here rather than guessing.
 */
export function workMaxHeight(d: Dims, style: MuseumStyle): number {
  return style.hang === 'salon' ? d.wallHeight * 0.3 : Math.min(2.1, d.wallHeight * 0.36);
}

/**
 * The bottom of the lowest thing hung on a corridor wall — the underside of
 * the frame, not of the accent panel behind it.
 *
 * A dado rail stands proud of the wall, so one that lands anywhere inside
 * this is a moulding running through the bottom of every picture in the room.
 */
export function hangBottom(d: Dims, style: MuseumStyle): number {
  const maxH = workMaxHeight(d, style);
  return hangHeight(d) - maxH / 2 - maxH * 0.15;
}

/**
 * The top of everything hung on a corridor wall: canvas, frame, and the
 * accent panel behind it, with a little air above.
 *
 * Anything a fixture puts on the wall above the pictures — the Orsay terrace
 * decks — has to clear this, and "clear it" cannot be a number typed in by
 * hand. The deck was fixed at 3.1 while the hang is derived from the room's
 * own height, and in the Orsay nave that put a 1.9-metre concrete shelf
 * straight through the top of every painting on both walls.
 */
export function hangTop(d: Dims, style: MuseumStyle): number {
  const maxH = workMaxHeight(d, style);
  // half the canvas, the deepest frame course, and the panel margin behind it
  let top = hangHeight(d) + maxH / 2 + maxH * 0.15 + 0.25;
  // a salon wall stacks two smaller works above the principal one
  if (style.hang === 'salon') top += maxH * 0.46 + 0.42;
  return top;
}
