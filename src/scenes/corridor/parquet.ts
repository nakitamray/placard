/**
 * Oak parquet in two tones, drawn once and tiled.
 *
 * The Grande Galerie's floor is a checker of large squares, each one made of
 * five or six boards, and the grain of every square runs across its
 * neighbour's. That alternation is the whole effect: it is why the floor
 * catches the light in bands as you walk down it, and why a plain wood
 * texture — however good — reads as laminate instead.
 *
 * One square is drawn here, twice, into a 2×2 tile: light square with the
 * boards running one way, dark square with them running the other, and the
 * pair repeated across the plane. Two squares would be enough for the
 * pattern, but a 2×2 keeps the tile seamless in both directions without any
 * offset arithmetic at the point of use.
 */
import * as THREE from 'three';

/** pixels per square in the drawn tile */
const S = 256;

let cached: THREE.Texture | null = null;

/** deterministic noise, so the boards are the same boards every visit */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One square of parquet: boards along x, with joints, grain and a little
 * variation in tone from board to board.
 */
function square(g: CanvasRenderingContext2D, x: number, y: number, base: string, dark: boolean) {
  const rnd = rng(dark ? 8821 : 3307);
  g.save();
  g.beginPath();
  g.rect(x, y, S, S);
  g.clip();

  g.fillStyle = base;
  g.fillRect(x, y, S, S);

  const boards = 6;
  const bh = S / boards;
  for (let i = 0; i < boards; i++) {
    const by = y + i * bh;
    // each board a shade off its neighbours, or the square reads as one panel
    const shade = 0.9 + rnd() * 0.2;
    g.globalAlpha = 0.5;
    g.fillStyle = `rgba(${dark ? '58,38,22' : '150,112,68'},${(shade - 0.9) * 2.2})`;
    g.fillRect(x, by, S, bh);
    g.globalAlpha = 1;

    // the grain: long shallow arcs down the board
    for (let k = 0; k < 13; k++) {
      const gy = by + rnd() * bh;
      g.strokeStyle = `rgba(${dark ? '40,24,12' : '116,82,46'},${0.06 + rnd() * 0.14})`;
      g.lineWidth = 0.6 + rnd() * 1.4;
      g.beginPath();
      g.moveTo(x, gy);
      g.bezierCurveTo(
        x + S * 0.33, gy + (rnd() - 0.5) * 5,
        x + S * 0.66, gy + (rnd() - 0.5) * 5,
        x + S, gy + (rnd() - 0.5) * 3,
      );
      g.stroke();
    }
    // the odd knot
    if (rnd() > 0.72) {
      const kx = x + rnd() * S;
      const ky = by + bh * (0.3 + rnd() * 0.4);
      g.strokeStyle = `rgba(${dark ? '32,18,8' : '104,72,38'},0.5)`;
      g.lineWidth = 1.2;
      for (let r = 2; r < 9; r += 2.4) {
        g.beginPath();
        g.ellipse(kx, ky, r * 1.7, r, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // the joint between boards
    g.strokeStyle = `rgba(${dark ? '26,14,6' : '92,62,32'},0.55)`;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(x, by + bh);
    g.lineTo(x + S, by + bh);
    g.stroke();
  }

  // the joint around the square itself, which is what makes it a square
  g.strokeStyle = 'rgba(38,22,10,0.6)';
  g.lineWidth = 2.6;
  g.strokeRect(x + 1, y + 1, S - 2, S - 2);
  g.restore();
}

export function parquetTexture(repeatX: number, repeatY: number): THREE.Texture | null {
  if (!cached) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S * 2;
    const g = canvas.getContext('2d');
    if (!g) return null;

    // light squares on one diagonal, dark on the other, grain crossed between
    square(g, 0, 0, '#B98A52', false);
    g.save();
    g.translate(S * 2, 0);
    g.rotate(Math.PI / 2);
    square(g, 0, 0, '#8A5F33', true);
    g.restore();
    g.save();
    g.translate(0, S * 2);
    g.rotate(-Math.PI / 2);
    square(g, 0, 0, '#8A5F33', true);
    g.restore();
    square(g, S, S, '#B98A52', false);

    cached = new THREE.CanvasTexture(canvas);
    cached.colorSpace = THREE.SRGBColorSpace;
    cached.wrapS = cached.wrapT = THREE.RepeatWrapping;
    cached.anisotropy = 8;
  }
  // two squares to a tile, so the repeat count is half the square count
  cached.repeat.set(Math.max(1, repeatX / 2), Math.max(1, repeatY / 2));
  return cached;
}
