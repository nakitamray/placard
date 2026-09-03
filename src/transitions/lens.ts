/**
 * The reading lens — a hole of paint dragged across a field of words.
 *
 * The reveal used to be a switch: hover the canvas and the whole painting
 * resolved, leave it and the whole painting dissolved. That is one bit of
 * information, and it hides the thing the exhibition is actually about — the
 * seam between the text and the picture, which is only interesting when you
 * can hold it still and look at it.
 *
 * So hovering now opens a lens instead. Inside a soft circle under the cursor
 * the glyphs give way and the reproduction shows through; everywhere else the
 * painting is still made of its own words. Clicking is still the whole
 * reveal — the lens is for looking, the click is for reading the label.
 *
 * Lives outside React for the same reason `revealAnim` does: it is written on
 * every pointer move and read in `useFrame`, and neither should cost a render.
 */
export const lens = {
  /** centre, in the artwork's own image pixels */
  x: 0,
  y: 0,
  /** radius in image pixels, set from the artwork's size when it loads */
  r: 260,
  /** 0 = closed, 1 = fully open — eased toward `want` every frame */
  amt: 0,
  /** what the pointer is asking for */
  want: 0,
};

// testing handle: confirms the lens is open without reading pixels
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__lens = lens;
}

/** the lens is meaningless without a pointer; close it and forget where it was */
export function closeLens() {
  lens.want = 0;
}

/**
 * Move the lens to a point given in normalised image space, y-down.
 *
 * `radius` is a fraction of the artwork's short edge. The landing hero wants a
 * generous hole because the field covers the whole viewport; a gallery canvas
 * fills most of the screen already, so a smaller circle reads as an aperture
 * you are holding over the picture rather than as the picture coming back.
 */
export function moveLens(
  u: number,
  v: number,
  imageW: number,
  imageH: number,
  radius = 0.24,
) {
  lens.x = u * imageW;
  lens.y = v * imageH;
  lens.r = Math.min(imageW, imageH) * radius;
  lens.want = 1;
}
