/**
 * The sky over a glazed vault after sunset, built once and shared.
 *
 * The Orsay's roof is the room. Lit as day it is a bright white shell and the
 * eye stops at it; lit as evening it has to become something you look
 * *through*, and what makes that happen is not darkness — a dark shell is
 * still a shell — but a gradient with stars in it. So this is drawn as the
 * sky actually is at that hour: deep indigo at the zenith, warming down
 * through violet to a low band of ember where the sun has just gone, with the
 * first stars out overhead and none at all near the horizon, where the glow
 * still drowns them.
 *
 * ── how it lands on the vault ──────────────────────────────────────────────
 *
 * The glazing is a half-cylinder laid on its side, so its u runs across the
 * arc — u = 0 and u = 1 are the two springings where the roof meets the
 * walls, u = 0.5 is directly overhead — and its v runs the length of the
 * corridor. That is why the gradient here is HORIZONTAL: left and right edges
 * of this canvas are the two horizons, the middle is the zenith.
 *
 * v is another matter. The vault is some seventy units long and the texture
 * would be stretched over all of it, which turns every star into a streak. So
 * it repeats along v, and the star field is drawn wrapped — anything close to
 * the top edge is drawn again at the bottom — so the repeat has no seam in
 * it.
 */
import * as THREE from 'three';

let cached: THREE.Texture | null = null;

/** how many times the sky repeats down the length of the vault */
export const SKY_REPEAT = 7;

export function duskSkyTexture(): THREE.Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;

  /*
   * The gradient, horizon to zenith to horizon. Symmetric, because both ends
   * of the vault's arc land on a horizon and the sun is long enough gone that
   * neither is much brighter than the other — this is the blue hour, not the
   * sunset, and its colour is nearly all in the top of the sky.
   */
  const grad = g.createLinearGradient(0, 0, W, 0);
  const stops: Array<[number, string]> = [
    [0.0, '#4A3A46'],
    [0.06, '#3A3350'],
    [0.16, '#2A2C52'],
    [0.32, '#161C3A'],
    [0.5, '#0E1430'],
    [0.68, '#161C3A'],
    [0.84, '#2A2C52'],
    [0.94, '#3A3350'],
    [1.0, '#4A3A46'],
  ];
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  /*
   * The last of the sun, low on both sides. A narrow ember wash added over
   * the gradient rather than mixed into it, so it stays warm against the blue
   * instead of turning the whole edge muddy.
   */
  for (const side of [0, 1]) {
    const ember = g.createLinearGradient(side ? W : 0, 0, side ? W * 0.82 : W * 0.18, 0);
    ember.addColorStop(0, 'rgba(216,120,70,0.46)');
    ember.addColorStop(0.4, 'rgba(140,80,72,0.12)');
    ember.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ember;
    g.fillRect(0, 0, W, H);
  }

  /*
   * The stars.
   *
   * Deterministic — a fixed multiplier-and-increment generator rather than
   * Math.random — so the sky is the same sky every visit, which matters
   * because it is a room the visitor comes back to. Density falls off toward
   * the horizons: overhead the sky is dark enough to hold them, at the
   * springing the afterglow has washed them out, and drawing them evenly
   * across the arc is the single thing that makes a painted sky look painted.
   */
  let seed = 20260906;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const dot = (x: number, y: number, r: number, a: number) => {
    const halo = g.createRadialGradient(x, y, 0, x, y, r);
    halo.addColorStop(0, `rgba(255,253,246,${a})`);
    halo.addColorStop(0.4, `rgba(226,232,248,${a * 0.42})`);
    halo.addColorStop(1, 'rgba(226,232,248,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  for (let i = 0; i < 1500; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    // 1 overhead, 0 at either horizon
    const up = Math.sin((x / W) * Math.PI);
    if (rnd() > up * up * 0.92 + 0.04) continue;

    // most are barely there; a few are worth looking at
    const bright = rnd();
    const r = bright > 0.985 ? 3.4 : bright > 0.9 ? 2.0 : 1.2;
    const a = (bright > 0.985 ? 1 : bright > 0.9 ? 0.72 : 0.4) * (0.4 + up * 0.6);

    dot(x, y, r, a);
    // and again across the seam, so the repeat down the vault does not show
    if (y < r) dot(x, y + H, r, a);
    else if (y > H - r) dot(x, y - H, r, a);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, SKY_REPEAT);
  tex.colorSpace = THREE.SRGBColorSpace;
  cached = tex;
  return tex;
}
