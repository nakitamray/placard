/**
 * The Orsay's great clock, drawn rather than modelled.
 *
 * The real one is a gilt-bronze case some seven metres across: a crown over an
 * arched hood, oak garlands down both sides, a fluted band, twelve white
 * enamel cartouches with the hours on them, three concentric rings of
 * beading and dentils, and a scrolled apron underneath hung with swags. As
 * geometry that is several thousand triangles of ornament nobody can walk up
 * to, at the one place in the room where the camera is always pointing.
 *
 * As a canvas it is one plane, one draw, and as much ornament as there is
 * patience to write. The middle is left transparent on purpose: the apse
 * behind it is glazed, so the sky is what you see through the dial — which is
 * what the clock actually is. It is a window with a mechanism on it.
 *
 * The canvas is taller than it is wide because the crown and the apron are
 * part of the object; the dial sits at DIAL_Y down the sheet, not in the
 * middle of it.
 */
import * as THREE from 'three';

const W = 1024;
const H = 1408;
/** where the centre of the dial sits, as a fraction of the canvas height */
export const DIAL_Y = 0.5;
/** the whole plate's aspect, for whoever sizes the plane */
export const FACE_ASPECT = W / H;

const CX = W / 2;
const CY = H * DIAL_Y;
const R = 462;

const GILT = '#C9A227';
const GILT_HI = '#F0D98A';
const GILT_LO = '#7E6318';
const BRONZE = '#6E5A32';
const BRONZE_LO = '#4A3D22';
const ENAMEL = '#FBF7EE';
const INK = '#1E1A14';

let cached: THREE.Texture | null = null;

/** a filled ring between two radii */
function ring(g: CanvasRenderingContext2D, r0: number, r1: number, fill: string | CanvasGradient) {
  g.beginPath();
  g.arc(CX, CY, r1, 0, Math.PI * 2);
  g.arc(CX, CY, r0, 0, Math.PI * 2, true);
  g.fillStyle = fill;
  g.fill();
}

/** the lit-from-above shading that makes a flat ring read as a moulding */
function moulding(g: CanvasRenderingContext2D, r0: number, r1: number) {
  const grad = g.createLinearGradient(0, CY - r1, 0, CY + r1);
  grad.addColorStop(0, GILT_HI);
  grad.addColorStop(0.42, GILT);
  grad.addColorStop(1, GILT_LO);
  ring(g, r0, r1, grad);
}

/** one acanthus scroll, drawn at the origin and placed by the caller */
function scroll(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.fillStyle = GILT;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(26, -6, 44, -26, 40, -52);
  g.bezierCurveTo(36, -74, 12, -80, 2, -62);
  g.bezierCurveTo(-6, -46, 10, -34, 20, -44);
  g.lineTo(14, -50);
  g.bezierCurveTo(8, -44, 2, -50, 6, -58);
  g.bezierCurveTo(12, -70, 30, -66, 32, -50);
  g.bezierCurveTo(35, -30, 18, -12, -2, -8);
  g.closePath();
  g.fill();
  g.restore();
}

/** a garland of oak leaves along an arc */
function garland(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const leaves = 22;
  for (let i = 0; i <= leaves; i++) {
    const t = i / leaves;
    // one quadratic through a sagging control point
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + sag;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const a = Math.atan2(y1 - y0, x1 - x0) + (t - 0.5) * 1.1;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = i % 2 ? GILT : GILT_LO;
    g.beginPath();
    g.ellipse(0, 0, 17, 8, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export function clockFaceTexture(): THREE.Texture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;

  /* ── the hood: an arched bronze case standing behind everything ──────── */
  g.fillStyle = BRONZE_LO;
  g.beginPath();
  g.moveTo(CX - R * 1.06, CY + R * 0.5);
  g.lineTo(CX - R * 1.06, CY - R * 0.15);
  g.arc(CX, CY - R * 0.15, R * 1.06, Math.PI, 0);
  g.lineTo(CX + R * 1.06, CY + R * 0.5);
  g.closePath();
  g.fill();

  // the frieze of small panels around the hood — the reference's blank
  // cartouches, which read as texture rather than as anything
  for (let i = -5; i <= 5; i++) {
    const a = Math.PI + (i / 11) * Math.PI * 0.92 + Math.PI / 2;
    const rr = R * 0.99;
    const x = CX + Math.cos(a) * rr;
    const y = CY - R * 0.15 + Math.sin(a) * rr;
    if (y > CY + R * 0.45) continue;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2);
    g.fillStyle = GILT_LO;
    g.fillRect(-26, -17, 52, 34);
    g.fillStyle = BRONZE;
    g.fillRect(-20, -12, 40, 24);
    g.restore();
  }

  /* ── the crown ────────────────────────────────────────────────────────── */
  const crownY = CY - R * 1.22;
  g.fillStyle = GILT;
  g.beginPath();
  g.moveTo(CX - 74, crownY + 52);
  g.lineTo(CX - 74, crownY + 6);
  for (let i = 0; i < 5; i++) {
    const x = CX - 74 + (i * 148) / 5;
    g.lineTo(x, crownY - 22);
    g.lineTo(x + 148 / 10, crownY + 6);
  }
  g.lineTo(CX + 74, crownY + 6);
  g.lineTo(CX + 74, crownY + 52);
  g.closePath();
  g.fill();
  g.fillStyle = GILT_LO;
  g.fillRect(CX - 84, crownY + 46, 168, 16);
  // laurel springing from under the crown, out to both sides
  garland(g, CX - 40, crownY + 66, CX - R * 0.92, CY - R * 0.34, 90);
  garland(g, CX + 40, crownY + 66, CX + R * 0.92, CY - R * 0.34, 90);

  /* ── the rings, outside in ───────────────────────────────────────────── */
  moulding(g, R * 0.955, R);            // outer bead
  ring(g, R * 0.9, R * 0.955, BRONZE);  // hollow
  moulding(g, R * 0.86, R * 0.9);       // the big torus

  // the fluted band: seventy-two radial flutes, alternating
  for (let i = 0; i < 72; i++) {
    const a0 = (i / 72) * Math.PI * 2;
    const a1 = ((i + 1) / 72) * Math.PI * 2;
    g.beginPath();
    g.arc(CX, CY, R * 0.855, a0, a1);
    g.arc(CX, CY, R * 0.74, a1, a0, true);
    g.closePath();
    g.fillStyle = i % 2 ? GILT : GILT_LO;
    g.fill();
  }

  moulding(g, R * 0.71, R * 0.745);

  /* ── the hour cartouches ─────────────────────────────────────────────── */
  const hourR = R * 0.6;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = CX + Math.cos(a) * hourR;
    const y = CY + Math.sin(a) * hourR;
    // the gilt bezel, then the enamel, then the hour
    g.beginPath();
    g.arc(x, y, 54, 0, Math.PI * 2);
    g.fillStyle = GILT;
    g.fill();
    g.beginPath();
    g.arc(x, y, 46, 0, Math.PI * 2);
    g.fillStyle = ENAMEL;
    g.fill();
    g.fillStyle = INK;
    g.font = `600 ${ROMAN[i].length > 3 ? 30 : 40}px Georgia, "Times New Roman", serif`;
    g.fillText(ROMAN[i], x, y + 2);
  }

  /* ── dentils, and the inner bezel the glazing sits in ────────────────── */
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    g.save();
    g.translate(CX + Math.cos(a) * R * 0.44, CY + Math.sin(a) * R * 0.44);
    g.rotate(a);
    g.fillStyle = i % 2 ? GILT : BRONZE;
    g.fillRect(-7, -6, 14, 12);
    g.restore();
  }
  moulding(g, R * 0.395, R * 0.425);
  moulding(g, R * 0.34, R * 0.365);

  /* ── the apron: scrolls, a plaque, and swags ─────────────────────────── */
  const apY = CY + R * 1.02;
  g.fillStyle = BRONZE;
  g.beginPath();
  g.moveTo(CX - 210, apY - 40);
  g.quadraticCurveTo(CX, apY + 130, CX + 210, apY - 40);
  g.quadraticCurveTo(CX, apY + 26, CX - 210, apY - 40);
  g.fill();
  g.fillStyle = GILT_LO;
  g.fillRect(CX - 96, apY + 6, 192, 44);
  g.fillStyle = BRONZE_LO;
  g.fillRect(CX - 88, apY + 12, 176, 32);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(CX + s * 168, apY - 6);
    g.scale(s, 1);
    scroll(g, 1.5);
    g.restore();
    garland(g, CX + s * 150, apY - 30, CX + s * 300, apY - 128, s * 30);
  }
  // the finial under the apron
  g.fillStyle = GILT;
  g.beginPath();
  g.moveTo(CX, apY + 138);
  g.quadraticCurveTo(CX + 34, apY + 78, CX, apY + 54);
  g.quadraticCurveTo(CX - 34, apY + 78, CX, apY + 138);
  g.fill();

  /* ── and the scrolled brackets at the shoulders ──────────────────────── */
  for (const s of [-1, 1]) {
    g.save();
    g.translate(CX + s * R * 1.0, CY + R * 0.18);
    g.scale(s, 1);
    scroll(g, 2.1);
    g.restore();
  }

  /*
   * Punch the dial out. Everything inside the inner bezel is glazing, and the
   * apse behind is a window — so this is the hole the sky comes through, and
   * the reason the clock reads as part of the wall of glass rather than as a
   * disc hung on it.
   */
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(CX, CY, R * 0.34, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cached = tex;
  return tex;
}
