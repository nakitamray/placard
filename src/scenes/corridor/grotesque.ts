/**
 * The painted ceiling of the Uffizi corridor, drawn rather than modelled.
 *
 * The real thing is grottesche: a cream ground carrying thin arabesques in
 * red, ochre and green, with a framed scene at the centre of every
 * compartment, candelabra running up the middle of the panels and small
 * cartouches at the corners. There are sixteenth-century square metres of it
 * and it is all line work.
 *
 * Line work is the wrong thing to model. A hundred thousand triangles of
 * tendril, seen from four metres below through a warm haze, is a smear that
 * costs a frame budget; the same ornament painted into a texture is legible,
 * costs one draw, and can be tiled the length of the corridor. So this builds
 * one compartment on a canvas at load and hands it back as a repeating map.
 *
 * It is drawn symmetrically about both axes, because that is how the originals
 * are laid out and because the eye reads symmetry as design and asymmetry as
 * noise. Everything else about it is deliberately loose: this is ornament seen
 * from the floor, not a reproduction of any particular bay.
 */
import * as THREE from 'three';

/** the palette the ornament is painted in — earth colours, nothing bright */
interface Ink {
  ground: string;
  line: string;
  red: string;
  gold: string;
  green: string;
  scene: string;
}

const INK: Ink = {
  ground: '#F1E7D2',
  line: '#8A6B45',
  red: '#A6462F',
  gold: '#C08A2E',
  green: '#6E7A4A',
  scene: '#B9A88A',
};

/** one compartment, square, at a size that still reads on a phone */
const SIZE = 512;

let cached: THREE.CanvasTexture | null = null;

/**
 * A scrolling tendril: a stem that curls, throws a leaf, and ends in a spiral.
 * Drawn from the centre outward so a mirrored copy meets it cleanly.
 */
function tendril(g: CanvasRenderingContext2D, len: number, sweep: number) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.3, -sweep, len * 0.7, sweep, len, 0);
  g.stroke();

  // the spiral it ends in
  g.beginPath();
  for (let i = 0; i <= 42; i++) {
    const t = i / 42;
    const a = t * Math.PI * 2.4;
    const r = (1 - t) * len * 0.16;
    const x = len + Math.cos(a) * r;
    const y = Math.sin(a) * r - len * 0.16;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  // a leaf halfway along
  g.beginPath();
  g.ellipse(len * 0.5, sweep * 0.28, len * 0.11, len * 0.045, -0.5, 0, Math.PI * 2);
  g.fill();
}

/** the candelabrum on the centre line of a panel: a stack of beads and rings */
function candelabrum(g: CanvasRenderingContext2D, h: number) {
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -h);
  g.stroke();
  for (let i = 1; i <= 5; i++) {
    const y = -(h * i) / 6;
    const r = 6 + (i % 2) * 5;
    g.beginPath();
    g.ellipse(0, y, r, r * 0.55, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-h * 0.12, -h);
  g.lineTo(h * 0.12, -h);
  g.stroke();
}

function paint(g: CanvasRenderingContext2D) {
  const S = SIZE;
  const c = S / 2;

  g.fillStyle = INK.ground;
  g.fillRect(0, 0, S, S);

  // a little unevenness, so the ground reads as plaster rather than as paper
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.fillStyle = `rgba(150,130,100,${0.02 + Math.random() * 0.03})`;
    g.fillRect(x, y, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }

  /* ── the framed scene at the centre ─────────────────────────────────── */
  const r = S * 0.17;
  g.save();
  g.translate(c, c);
  // an octagonal frame in ochre with a red fillet inside it
  g.strokeStyle = INK.gold;
  g.lineWidth = 7;
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  g.fillStyle = INK.scene;
  g.fill();
  g.strokeStyle = INK.red;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  g.stroke();
  // the figure in it, suggested: two washes and a horizon, which is all a
  // painted scene amounts to at this distance
  g.fillStyle = 'rgba(120,96,66,0.55)';
  g.beginPath();
  g.ellipse(0, r * 0.18, r * 0.52, r * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(160,138,104,0.5)';
  g.beginPath();
  g.ellipse(-r * 0.12, -r * 0.12, r * 0.2, r * 0.3, 0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();

  /* ── the arabesques, in four mirrored quadrants ─────────────────────── */
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      g.save();
      g.translate(c, c);
      g.scale(sx, sy);

      g.strokeStyle = INK.line;
      g.fillStyle = INK.green;
      g.lineWidth = 2.6;
      g.save();
      g.translate(r * 1.1, r * 0.5);
      tendril(g, S * 0.2, S * 0.055);
      g.restore();

      g.save();
      g.translate(r * 0.62, r * 1.12);
      g.rotate(Math.PI / 2);
      tendril(g, S * 0.16, S * 0.045);
      g.restore();

      // the corner cartouche
      g.strokeStyle = INK.red;
      g.lineWidth = 3.2;
      g.beginPath();
      g.ellipse(S * 0.36, S * 0.36, S * 0.052, S * 0.036, Math.PI / 4, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(166,70,47,0.18)';
      g.fill();

      // and the candelabrum standing on the border, pointing in
      g.strokeStyle = INK.gold;
      g.lineWidth = 2.2;
      g.save();
      g.translate(0, S * 0.44);
      candelabrum(g, S * 0.13);
      g.restore();

      g.restore();
    }
  }

  /* ── the border, which is what makes it a compartment ───────────────── */
  const inset = S * 0.045;
  g.strokeStyle = INK.gold;
  g.lineWidth = 9;
  g.strokeRect(inset, inset, S - inset * 2, S - inset * 2);
  g.strokeStyle = INK.line;
  g.lineWidth = 2;
  g.strokeRect(inset + 9, inset + 9, S - (inset + 9) * 2, S - (inset + 9) * 2);
  // a bead run inside the border
  g.fillStyle = INK.red;
  const beads = 26;
  for (let i = 0; i < beads; i++) {
    const t = inset + 18 + ((S - (inset + 18) * 2) * i) / (beads - 1);
    for (const [x, y] of [
      [t, inset + 18],
      [t, S - inset - 18],
      [inset + 18, t],
      [S - inset - 18, t],
    ]) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * The compartment, as a repeating texture. Built once and shared: every bay of
 * every visit is the same canvas.
 */
export function grotesqueTexture(): THREE.Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  paint(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cached = tex;
  return tex;
}
