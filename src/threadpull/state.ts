/**
 * Thread Pull — shared state between the WebGL glyph pass and the DOM
 * reading panel.
 *
 * The animated values live here rather than in Zustand so the flight can run
 * at frame rate without re-rendering React on every tick. Zustand carries
 * only the discrete facts (which region is held, is the panel open).
 */
import type { ArtworkRegion } from '../types';

export const threadPullAnim = {
  /** 0 = glyphs attached to the painting, 1 = fully extracted */
  detach: 0,
  /** region box in image-space pixels: x0, y0, x1, y1 */
  box: [0, 0, 0, 0] as [number, number, number, number],
  /** corpus offset captured at extraction, so extracted text stops advancing */
  frozenOffset: 0,
};

// debug/testing handle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__threadpull = threadPullAnim;
}

/**
 * Projects a point in the active artwork's image space (normalised 0..1,
 * y-down) to viewport pixels. Set each frame by GalleryScene; consumed by the
 * DOM flight so characters launch from exactly where they sit on the canvas.
 *
 * Recomputed from the live camera every call, so a window resize mid-flight
 * simply yields new coordinates — nothing is cached to go stale.
 */
export const artworkProjector: {
  project: ((u: number, v: number) => { x: number; y: number } | null) | null;
} = { project: null };

export function regionCentre(r: ArtworkRegion): [number, number] {
  return [(r.box[0] + r.box[2]) / 2, (r.box[1] + r.box[3]) / 2];
}

/**
 * Which region contains a normalised point. Smallest box wins, so a small
 * region nested inside a large one (a face against a wall) is reachable.
 *
 * Hand-authored boxes never tile the canvas exactly, and hunting for an
 * invisible edge feels broken, so a near miss snaps to the closest box
 * within SNAP of its edge.
 */
const SNAP = 0.06;

export function regionAt(regions: ArtworkRegion[], u: number, v: number): ArtworkRegion | null {
  let best: ArtworkRegion | null = null;
  let bestArea = Infinity;
  for (const r of regions) {
    const [x0, y0, x1, y1] = r.box;
    if (u < x0 || u > x1 || v < y0 || v > y1) continue;
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea) {
      bestArea = area;
      best = r;
    }
  }
  if (best) return best;

  let nearest: ArtworkRegion | null = null;
  let nearestD = SNAP;
  for (const r of regions) {
    const [x0, y0, x1, y1] = r.box;
    const dx = Math.max(x0 - u, 0, u - x1);
    const dy = Math.max(y0 - v, 0, v - y1);
    const d = Math.hypot(dx, dy);
    if (d < nearestD) {
      nearestD = d;
      nearest = r;
    }
  }
  return nearest;
}
