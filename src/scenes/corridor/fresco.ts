/**
 * The Gallery of Maps, painted rather than modelled.
 *
 * Two surfaces make that corridor, and neither of them is geometry: a barrel
 * vault encrusted with gilded stucco and painted scenes, and forty map panels
 * in ocean blue and forest green running the length of both walls. Modelling
 * either is hopeless — the vault alone is thousands of separate sculpted
 * elements, and a map is a coastline — and flat colour in their place is what
 * made this room the blandest in the exhibition.
 *
 * So they are drawn, once, into canvases at load: one tile of vault that
 * repeats bay by bay, and a small set of map panels that are dealt out along
 * the wall so no two neighbours are the same. What is still modelled is only
 * what has to catch a highlight — the raised gilt ribs, the cornice, the
 * marble trim — because gold is the one thing a texture cannot fake under a
 * moving light.
 *
 * Everything here is drawn symmetrically and loosely. It is ornament seen from
 * four metres below and eight metres away, not a facsimile of any one bay.
 */
import * as THREE from 'three';

/* ── the vault ──────────────────────────────────────────────────────────── */

const VAULT_W = 1024;
const VAULT_H = 512;

let vault: THREE.CanvasTexture | null = null;

/** a run of gilded egg-and-dart, along a straight line */
function beadRun(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, n: number) {
  const dx = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.ellipse(x0 + i * dx, y0, dx * 0.3, dx * 0.42, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** a suggested figure: a wash for the body, a lighter one for the drapery */
function figure(g: CanvasRenderingContext2D, x: number, y: number, s: number, tone: string) {
  g.fillStyle = tone;
  g.beginPath();
  g.ellipse(x, y - s * 0.55, s * 0.2, s * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - s * 0.34, y + s * 0.5);
  g.quadraticCurveTo(x, y - s * 0.5, x + s * 0.34, y + s * 0.5);
  g.closePath();
  g.fill();
}

function paintVault(g: CanvasRenderingContext2D) {
  const W = VAULT_W;
  const H = VAULT_H;

  // the gold ground the whole vault is worked on
  const ground = g.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#C79A2E');
  ground.addColorStop(0.35, '#E5C25A');
  ground.addColorStop(0.5, '#F0D479');
  ground.addColorStop(0.65, '#E5C25A');
  ground.addColorStop(1, '#C79A2E');
  g.fillStyle = ground;
  g.fillRect(0, 0, W, H);

  // the crown panel: the painted scene down the centre line of the vault
  const cx = W / 2;
  g.save();
  g.translate(cx, H / 2);
  g.fillStyle = '#F6E7BC';
  g.fillRect(-W * 0.17, -H * 0.3, W * 0.34, H * 0.6);
  g.fillStyle = '#8E7B57';
  g.fillRect(-W * 0.15, -H * 0.27, W * 0.3, H * 0.54);
  // sky and ground inside it, then two figures
  const sky = g.createLinearGradient(0, -H * 0.27, 0, H * 0.27);
  sky.addColorStop(0, '#9FB6C6');
  sky.addColorStop(0.55, '#C9C2A4');
  sky.addColorStop(1, '#6E6242');
  g.fillStyle = sky;
  g.fillRect(-W * 0.145, -H * 0.265, W * 0.29, H * 0.53);
  figure(g, -W * 0.05, H * 0.1, H * 0.3, 'rgba(150,60,44,0.72)');
  figure(g, W * 0.05, H * 0.12, H * 0.26, 'rgba(60,70,90,0.6)');
  // the raised gilt frame round it
  g.strokeStyle = '#B8862A';
  g.lineWidth = 9;
  g.strokeRect(-W * 0.16, -H * 0.285, W * 0.32, H * 0.57);
  g.restore();

  /* the flanking compartments, one either side of the crown panel */
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx + s * W * 0.29, H / 2);
    g.fillStyle = 'rgba(160, 40, 36, 0.85)';
    g.beginPath();
    g.ellipse(0, 0, W * 0.075, H * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#EBD489';
    g.lineWidth = 7;
    g.stroke();
    figure(g, 0, H * 0.06, H * 0.22, 'rgba(240,225,190,0.75)');
    // scrollwork spilling off it
    g.strokeStyle = 'rgba(140, 96, 24, 0.75)';
    g.lineWidth = 4;
    for (const dy of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, dy * H * 0.21);
      g.bezierCurveTo(W * 0.05, dy * H * 0.3, -W * 0.05, dy * H * 0.36, 0, dy * H * 0.45);
      g.stroke();
    }
    g.restore();
  }

  /* the transverse borders, at both ends of the tile, which is what makes the
     vault read as a series of compartments rather than one long tube */
  for (const x of [0, W]) {
    g.save();
    g.translate(x, 0);
    g.fillStyle = '#B8862A';
    g.fillRect(-W * 0.035, 0, W * 0.07, H);
    g.fillStyle = '#F2DC9A';
    g.fillRect(-W * 0.02, 0, W * 0.04, H);
    g.fillStyle = '#A8761F';
    beadRun(g, 0, H * 0.08, 0, 0);
    g.restore();
  }
  // and a bead course down each border
  g.fillStyle = '#A8761F';
  for (const x of [W * 0.035, W - W * 0.035]) {
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.ellipse(x, (i + 0.5) * (H / 26), 5, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  /* the springing bands, along both long edges: red and white grotesque */
  for (const y of [0, H]) {
    g.save();
    g.translate(0, y);
    g.fillStyle = 'rgba(150, 45, 38, 0.9)';
    g.fillRect(0, -H * 0.055, W, H * 0.11);
    g.fillStyle = '#EEDCA6';
    for (let i = 0; i < 30; i++) {
      const x = (i + 0.5) * (W / 30);
      g.beginPath();
      g.ellipse(x, 0, W * 0.011, H * 0.03, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // a little age: the gold is not even anywhere
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,86,30,${0.02 + Math.random() * 0.05})`;
    const x = Math.random() * W;
    const y = Math.random() * H;
    g.fillRect(x, y, 3 + Math.random() * 9, 2 + Math.random() * 6);
  }
}

/** One bay of vault, as a texture that repeats along the corridor. */
export function vaultFrescoTexture(repeat: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!vault) {
    const canvas = document.createElement('canvas');
    canvas.width = VAULT_W;
    canvas.height = VAULT_H;
    const g = canvas.getContext('2d');
    if (!g) return null;
    paintVault(g);
    vault = new THREE.CanvasTexture(canvas);
    vault.colorSpace = THREE.SRGBColorSpace;
    vault.anisotropy = 4;
  }
  const own = vault.clone();
  own.needsUpdate = true;
  own.wrapS = THREE.RepeatWrapping;
  own.wrapT = THREE.RepeatWrapping;
  // u runs around the vault, v runs along the corridor
  own.repeat.set(1, repeat);
  return own;
}

/* ── the maps ───────────────────────────────────────────────────────────── */

const MAP_W = 512;
const MAP_H = 768;
/** how many different panels are drawn before the wall starts repeating */
const MAP_VARIANTS = 6;

const maps: Array<THREE.CanvasTexture | null> = [];

/** a deterministic little generator, so a panel is the same on every visit */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * An irregular closed coast.
 *
 * Two scales of wobble, not one: a slow one that gives the landmass its shape
 * and a fast one that gives it inlets. A single random radius per vertex — the
 * first version of this — produces a spiky blob that reads as a graphic, and
 * the whole point of these panels is that they should read as maps from the
 * middle of the corridor and still hold up when you walk right at one.
 */
function coast(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number) {
  const n = 220;
  const seedA = rand() * 6;
  const seedB = rand() * 6;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const slow = 1 + 0.3 * Math.sin(a * 2 + seedA) + 0.18 * Math.sin(a * 3 - seedB);
    const fast = 1 + 0.07 * Math.sin(a * 17 + seedA) + 0.045 * Math.sin(a * 29 - seedB);
    const rr = r * 0.8 * slow * fast;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 1.3;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function paintMap(g: CanvasRenderingContext2D, variant: number) {
  const W = MAP_W;
  const H = MAP_H;
  const rand = rng(variant + 3);

  // the sea
  const sea = g.createLinearGradient(0, 0, W, H);
  sea.addColorStop(0, '#1E4159');
  sea.addColorStop(0.5, '#27566F');
  sea.addColorStop(1, '#17334A');
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);

  // the engraver's swell: horizontal hatching all over the water
  g.strokeStyle = 'rgba(180, 205, 215, 0.13)';
  g.lineWidth = 1;
  for (let y = 8; y < H; y += 9) {
    g.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const yy = y + Math.sin((x + y) * 0.045) * 2.2;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }

  // the land: one large mass and two or three islands
  const masses: Array<[number, number, number]> = [
    [W * (0.4 + rand() * 0.2), H * (0.42 + rand() * 0.16), W * 0.34],
    [W * (0.2 + rand() * 0.2), H * (0.16 + rand() * 0.12), W * 0.12],
    [W * (0.62 + rand() * 0.24), H * (0.76 + rand() * 0.14), W * 0.13],
  ];
  for (const [cx, cy, r] of masses) {
    // the shoreline shading first, as a soft halo outside the coast
    coast(g, cx, cy, r * 1.06, rand);
    g.fillStyle = 'rgba(150, 175, 180, 0.22)';
    g.fill();

    coast(g, cx, cy, r, rand);
    g.save();
    g.clip();
    const land = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    land.addColorStop(0, '#4E5A2C');
    land.addColorStop(0.5, '#6B7539');
    land.addColorStop(1, '#3E4A24');
    g.fillStyle = land;
    g.fillRect(cx - r * 2, cy - r * 3, r * 4, r * 6);
    // mottling, so the land is a painted surface rather than a flat shape
    for (let i = 0; i < 260; i++) {
      const x = cx + (rand() - 0.5) * r * 2.4;
      const y = cy + (rand() - 0.5) * r * 3.4;
      const t = rand();
      g.fillStyle =
        t > 0.6
          ? `rgba(140,146,86,${0.12 + rand() * 0.2})`
          : `rgba(58,66,32,${0.1 + rand() * 0.2})`;
      g.beginPath();
      g.ellipse(x, y, 3 + rand() * 11, 2 + rand() * 7, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // rivers, which are what make a green shape read as territory
    g.strokeStyle = 'rgba(90, 120, 130, 0.55)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      let x = cx + (rand() - 0.5) * r;
      let y = cy + (rand() - 0.5) * r * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 22; k++) {
        x += (rand() - 0.5) * 22;
        y += 8 + rand() * 12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();

    // the coast, inked: a dark line with a pale one just inside it, which is
    // how an engraver separates land from sea and what the eye looks for
    coast(g, cx, cy, r, rand);
    g.strokeStyle = 'rgba(30, 26, 14, 0.85)';
    g.lineWidth = 3;
    g.stroke();
    coast(g, cx, cy, r * 0.985, rand);
    g.strokeStyle = 'rgba(236, 228, 194, 0.5)';
    g.lineWidth = 1.4;
    g.stroke();
  }

  // mountains: little hatched carets, the way a sixteenth-century map draws them
  g.strokeStyle = 'rgba(56, 44, 26, 0.7)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 90; i++) {
    const [cx, cy, r] = masses[0];
    const x = cx + (rand() - 0.5) * r * 1.2;
    const y = cy + (rand() - 0.5) * r * 1.9;
    const s = 5 + rand() * 7;
    g.beginPath();
    g.moveTo(x - s, y + s * 0.5);
    g.lineTo(x, y - s * 0.6);
    g.lineTo(x + s, y + s * 0.5);
    g.stroke();
  }

  // towns, and the roads between a few of them
  g.fillStyle = 'rgba(238, 226, 190, 0.9)';
  const towns: Array<[number, number]> = [];
  for (let i = 0; i < 14; i++) {
    const [cx, cy, r] = masses[0];
    const x = cx + (rand() - 0.5) * r * 1.3;
    const y = cy + (rand() - 0.5) * r * 2;
    towns.push([x, y]);
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(238, 226, 190, 0.28)';
  for (let i = 1; i < towns.length; i += 2) {
    g.beginPath();
    g.moveTo(towns[i - 1][0], towns[i - 1][1]);
    g.lineTo(towns[i][0], towns[i][1]);
    g.stroke();
  }

  // a ship, and a compass rose
  g.strokeStyle = 'rgba(240, 232, 200, 0.6)';
  g.lineWidth = 1.6;
  const sx = W * (0.14 + rand() * 0.1);
  const sy = H * (0.62 + rand() * 0.2);
  g.beginPath();
  g.moveTo(sx - 13, sy);
  g.quadraticCurveTo(sx, sy + 9, sx + 13, sy);
  g.moveTo(sx, sy);
  g.lineTo(sx, sy - 18);
  g.lineTo(sx + 10, sy - 8);
  g.lineTo(sx, sy - 6);
  g.stroke();

  const rx = W * 0.78;
  const ry = H * 0.2;
  g.strokeStyle = 'rgba(238, 226, 190, 0.5)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(rx, ry);
    g.lineTo(rx + Math.cos(a) * 22, ry + Math.sin(a) * 22);
    g.stroke();
  }
  g.beginPath();
  g.arc(rx, ry, 9, 0, Math.PI * 2);
  g.stroke();

  // the cartouche: a painted tablet with the province's name on it, unreadable
  // at this size, which is what a name on a wall map is from the middle of a
  // corridor
  const cw = W * 0.42;
  const ch = H * 0.075;
  const px = W * 0.5 - cw / 2;
  const py = H * 0.045;
  g.fillStyle = 'rgba(232, 216, 176, 0.92)';
  g.fillRect(px, py, cw, ch);
  g.strokeStyle = '#8A6A28';
  g.lineWidth = 3;
  g.strokeRect(px, py, cw, ch);
  g.fillStyle = 'rgba(70, 52, 28, 0.75)';
  for (let i = 0; i < 3; i++) {
    const lw = cw * (0.34 + rand() * 0.4);
    g.fillRect(px + (cw - lw) / 2, py + ch * (0.24 + i * 0.24), lw, 3);
  }

  // age: the varnish has gone brown at the edges of every one of these
  const vig = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.95);
  vig.addColorStop(0, 'rgba(120, 96, 50, 0)');
  vig.addColorStop(1, 'rgba(70, 52, 24, 0.26)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  // the painted border round the whole panel
  g.strokeStyle = '#C9A227';
  g.lineWidth = 14;
  g.strokeRect(7, 7, W - 14, H - 14);
  g.strokeStyle = 'rgba(60, 44, 24, 0.55)';
  g.lineWidth = 2;
  g.strokeRect(17, 17, W - 34, H - 34);
}

/** One map panel. `i` picks between a handful of drawn variants. */
export function mapPanelTexture(i: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const v = ((i % MAP_VARIANTS) + MAP_VARIANTS) % MAP_VARIANTS;
  const found = maps[v];
  if (found) return found;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  paintMap(g, v);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  maps[v] = tex;
  return tex;
}
