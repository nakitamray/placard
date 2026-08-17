/**
 * build-placeholder.ts — procedural painterly stand-ins.
 *
 * The exhibition is built from public-domain scans dropped into
 * data/artworks/{id}/source.jpg. When a scan is absent, this module renders a
 * deterministic painterly abstraction from the artwork's own `placeholder`
 * spec — an archetype (what kind of picture it is) plus the painting's real
 * palette — so the whole pipeline runs end to end and the corridor reads
 * correctly at a distance.
 *
 * This matters more than it sounds: downstream, build-glyphs only ever looks
 * at tonal structure and mean colour per cell. A stand-in with the right
 * masses in the right places and the right palette produces a glyph field
 * that behaves like the real one. Drop the scan in and rebuild; nothing else
 * in the pipeline changes.
 *
 * Every shape is placed by a seeded PRNG, so a given spec always renders the
 * same image — rebuilds are reproducible and diffs stay quiet.
 */

export type Archetype =
  /** single sitter: luminous head-and-shoulders mass on a dark ground */
  | 'portrait'
  /** many bodies across a horizontal band under a dramatic sky */
  | 'figure-group'
  /** horizon bands, sky gradient, foreground masses */
  | 'landscape'
  /** dark field carrying points and streaks of light */
  | 'nocturne'
  /** raking window light, wall planes, a figure at a table */
  | 'interior'
  /** vault arcs and a central tondo inside an ornamental border */
  | 'fresco'
  /** table band with rounded objects */
  | 'still-life'
  /** horizontal registers of repeated marks — papyrus, scroll, codex */
  | 'register'
  /** one great curved mass breaking across the frame */
  | 'wave'
  /** receding arches and a bright vanishing point */
  | 'architectural';

export interface PlaceholderSpec {
  /** width / height */
  aspect: number;
  archetype: Archetype;
  /** 5–7 colours, ordered darkest → lightest, last entry read as the accent */
  palette: string[];
  seed?: number;
}

/* ── seeded randomness ─────────────────────────────────────────────────── */

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function shiftHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

/* ── shape emitters ────────────────────────────────────────────────────── */

interface Ctx {
  W: number;
  H: number;
  rnd: () => number;
  pal: string[];
  out: string[];
  /**
   * Where the picture is detailed — faces, hands, foam, crowds.
   *
   * build-glyphs sizes each glyph from the local variance of the image, so
   * these regions are what make the glyph field vary: small letters across
   * worked passages, large ones across sky and flat ground. Every archetype
   * declares its own, in normalised coordinates.
   */
  focus: Array<{ x: number; y: number; r: number }>;
}

/** mark a detailed passage; fineWork concentrates its strokes here */
function focal(c: Ctx, x: number, y: number, r: number) {
  c.focus.push({ x, y, r });
}

/** a soft-edged painterly mass */
function blob(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  opacity = 1,
  rot = 0,
) {
  c.out.push(
    `<ellipse cx="${(x * c.W).toFixed(1)}" cy="${(y * c.H).toFixed(1)}" ` +
      `rx="${(rx * c.W).toFixed(1)}" ry="${(ry * c.H).toFixed(1)}" fill="${fill}" ` +
      `opacity="${opacity.toFixed(3)}" transform="rotate(${rot.toFixed(1)} ${(x * c.W).toFixed(1)} ${(y * c.H).toFixed(1)})"/>`,
  );
}

function band(c: Ctx, y0: number, y1: number, fill: string, opacity = 1) {
  c.out.push(
    `<rect x="0" y="${(y0 * c.H).toFixed(1)}" width="${c.W}" ` +
      `height="${((y1 - y0) * c.H).toFixed(1)}" fill="${fill}" opacity="${opacity.toFixed(3)}"/>`,
  );
}

function box(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  opacity = 1,
) {
  c.out.push(
    `<rect x="${(x * c.W).toFixed(1)}" y="${(y * c.H).toFixed(1)}" ` +
      `width="${(w * c.W).toFixed(1)}" height="${(h * c.H).toFixed(1)}" ` +
      `fill="${fill}" opacity="${opacity.toFixed(3)}"/>`,
  );
}

function arc(c: Ctx, cx: number, cy: number, r: number, fill: string, opacity = 1) {
  const R = r * c.W;
  c.out.push(
    `<path d="M${(cx * c.W - R).toFixed(1)},${(cy * c.H).toFixed(1)} ` +
      `A${R.toFixed(1)},${R.toFixed(1)} 0 0 1 ${(cx * c.W + R).toFixed(1)},${(cy * c.H).toFixed(1)} Z" ` +
      `fill="${fill}" opacity="${opacity.toFixed(3)}"/>`,
  );
}

/**
 * The painterly pass: short directional strokes that break every hard edge.
 *
 * Strokes are laid in drifting clusters rather than scattered independently,
 * and each one is pulled most of the way toward the picture's mid-tone before
 * it is drawn. Both matter — uniformly scattered, full-strength palette picks
 * read as confetti thrown at the canvas, not as worked paint.
 */
function brushwork(c: Ctx, count: number, sizeScale = 1) {
  const midTone = mid(c.pal);
  let cx = c.rnd();
  let cy = c.rnd();
  let angle = c.rnd() * 180;
  for (let i = 0; i < count; i++) {
    // every so often the hand lifts and starts a new passage
    if (i % 7 === 0) {
      cx = c.rnd();
      cy = c.rnd();
      angle = c.rnd() * 180;
    }
    const x = cx + (c.rnd() - 0.5) * 0.16;
    const y = cy + (c.rnd() - 0.5) * 0.16;
    const col = c.pal[Math.floor(c.rnd() * c.pal.length)];
    blob(
      c,
      x,
      y,
      (0.008 + c.rnd() * 0.026) * sizeScale,
      (0.003 + c.rnd() * 0.009) * sizeScale,
      shiftHex(mixHex(col, midTone, 0.45), (c.rnd() - 0.5) * 18),
      0.05 + c.rnd() * 0.11,
      angle + (c.rnd() - 0.5) * 40,
    );
  }
}

/* ── archetypes ────────────────────────────────────────────────────────── */

/** palette accessors — specs are authored darkest → lightest */
const dark = (p: string[]) => p[0];
const mid = (p: string[]) => p[Math.floor(p.length * 0.4)];
const light = (p: string[]) => p[p.length - 2] ?? p[p.length - 1];
const accent = (p: string[]) => p[p.length - 1];

function drawPortrait(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, dark(p));
  // ground glow behind the sitter
  blob(c, 0.5, 0.46, 0.55, 0.5, mixHex(dark(p), mid(p), 0.55), 0.85);
  // torso
  blob(c, 0.5, 0.86, 0.34, 0.32, mixHex(dark(p), mid(p), 0.8), 0.95);
  // shoulders
  blob(c, 0.5, 0.72, 0.28, 0.14, mid(p), 0.9);
  // head
  blob(c, 0.5, 0.42, 0.135, 0.115, light(p), 0.97);
  // brow / cheek modelling
  blob(c, 0.47, 0.38, 0.08, 0.06, shiftHex(light(p), 16), 0.6);
  blob(c, 0.55, 0.47, 0.06, 0.05, mixHex(light(p), accent(p), 0.35), 0.5);
  // neck
  blob(c, 0.5, 0.56, 0.055, 0.06, mixHex(light(p), mid(p), 0.4), 0.85);
  // a single accent — collar, ribbon, hand
  blob(c, 0.5, 0.63, 0.13, 0.035, accent(p), 0.75);
  focal(c, 0.5, 0.42, 0.17); // the head
  focal(c, 0.5, 0.63, 0.15); // collar and hands
  brushwork(c, 150, 0.8);
}

function drawFigureGroup(c: Ctx) {
  const p = c.pal;
  // sky
  band(c, 0, 0.55, mixHex(mid(p), light(p), 0.55));
  blob(c, 0.62, 0.2, 0.5, 0.28, light(p), 0.75);
  blob(c, 0.2, 0.14, 0.34, 0.18, mixHex(dark(p), mid(p), 0.5), 0.55);
  // ground
  band(c, 0.55, 1, mixHex(dark(p), mid(p), 0.35));
  blob(c, 0.5, 1.0, 0.8, 0.32, dark(p), 0.7);
  // the frieze of bodies
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = 0.08 + (i / (n - 1)) * 0.84 + (c.rnd() - 0.5) * 0.04;
    const y = 0.58 + c.rnd() * 0.2;
    const s = 0.7 + c.rnd() * 0.7;
    const body = i % 3 === 0 ? accent(p) : mixHex(dark(p), mid(p), 0.3 + c.rnd() * 0.5);
    blob(c, x, y + 0.13 * s, 0.05 * s, 0.12 * s, body, 0.92, (c.rnd() - 0.5) * 22);
    blob(c, x, y - 0.02 * s, 0.028 * s, 0.032 * s, light(p), 0.9);
  }
  // the raised accent — a flag, a torch, an arm
  blob(c, 0.46, 0.42, 0.09, 0.05, accent(p), 0.9, -18);
  focal(c, 0.5, 0.68, 0.42); // the frieze of bodies
  focal(c, 0.46, 0.42, 0.14); // the raised accent
  brushwork(c, 190);
}

function drawLandscape(c: Ctx) {
  const p = c.pal;
  const horizon = 0.42 + c.rnd() * 0.1;
  band(c, 0, horizon, light(p));
  blob(c, 0.5, horizon * 0.35, 0.75, 0.3, mixHex(light(p), mid(p), 0.4), 0.6);
  blob(c, 0.75, 0.16, 0.22, 0.1, shiftHex(light(p), 22), 0.7);
  band(c, horizon, 1, mid(p));
  blob(c, 0.5, 1.02, 0.9, 0.4, mixHex(mid(p), dark(p), 0.6), 0.85);
  // middle-distance masses
  for (let i = 0; i < 7; i++) {
    const x = c.rnd();
    blob(
      c,
      x,
      horizon + 0.02 + c.rnd() * 0.08,
      0.06 + c.rnd() * 0.14,
      0.03 + c.rnd() * 0.05,
      mixHex(mid(p), dark(p), 0.3 + c.rnd() * 0.4),
      0.8,
    );
  }
  // foreground accents — figures, poppies, stooks
  for (let i = 0; i < 14; i++) {
    blob(
      c,
      c.rnd(),
      horizon + 0.2 + c.rnd() * 0.75,
      0.012 + c.rnd() * 0.03,
      0.008 + c.rnd() * 0.02,
      accent(p),
      0.5 + c.rnd() * 0.4,
    );
  }
  focal(c, 0.5, horizon + 0.04, 0.3); // the middle distance
  focal(c, 0.5, horizon + 0.55, 0.34); // foreground incident
  brushwork(c, 220);
}

function drawNocturne(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, dark(p));
  band(c, 0, 0.6, mixHex(dark(p), mid(p), 0.55));
  // water / lower half
  band(c, 0.6, 1, mixHex(dark(p), mid(p), 0.28));
  // swirls of sky
  for (let i = 0; i < 9; i++) {
    blob(
      c,
      c.rnd(),
      c.rnd() * 0.55,
      0.1 + c.rnd() * 0.2,
      0.04 + c.rnd() * 0.08,
      mixHex(mid(p), light(p), c.rnd() * 0.6),
      0.28,
      (c.rnd() - 0.5) * 60,
    );
  }
  // stars / lamps
  for (let i = 0; i < 26; i++) {
    const x = c.rnd();
    const y = c.rnd() * 0.62;
    blob(c, x, y, 0.012, 0.012, accent(p), 0.85);
    blob(c, x, y, 0.03, 0.026, accent(p), 0.2);
  }
  // reflections dragged down the water
  for (let i = 0; i < 12; i++) {
    const x = c.rnd();
    blob(c, x, 0.68 + c.rnd() * 0.26, 0.008, 0.06 + c.rnd() * 0.09, accent(p), 0.4);
  }
  focal(c, 0.5, 0.3, 0.42); // the lit sky
  focal(c, 0.5, 0.8, 0.34); // reflections on the water
  brushwork(c, 200, 0.9);
}

function drawInterior(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, mixHex(dark(p), mid(p), 0.5));
  // wall lit from the window side
  box(c, 0, 0, 1, 0.72, mid(p));
  blob(c, 0.12, 0.3, 0.35, 0.4, light(p), 0.5);
  // window
  box(c, 0.03, 0.08, 0.2, 0.42, shiftHex(light(p), 30), 0.95);
  box(c, 0.125, 0.08, 0.012, 0.42, mixHex(mid(p), dark(p), 0.6), 0.9);
  // table band
  box(c, 0, 0.72, 1, 0.28, mixHex(dark(p), mid(p), 0.35));
  blob(c, 0.5, 0.74, 0.62, 0.05, mixHex(mid(p), light(p), 0.35), 0.8);
  // figure
  blob(c, 0.52, 0.62, 0.16, 0.2, mixHex(dark(p), accent(p), 0.55), 0.95);
  blob(c, 0.52, 0.4, 0.075, 0.07, light(p), 0.96);
  blob(c, 0.5, 0.36, 0.085, 0.045, shiftHex(light(p), 18), 0.7);
  // the small bright object the picture is really about
  blob(c, 0.32, 0.75, 0.05, 0.035, accent(p), 0.9);
  focal(c, 0.52, 0.42, 0.16); // the face
  focal(c, 0.3, 0.76, 0.18); // the tabletop
  brushwork(c, 160, 0.85);
}

function drawFresco(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, light(p));
  // gilded ornamental border
  box(c, 0, 0, 1, 0.06, accent(p), 0.85);
  box(c, 0, 0.94, 1, 0.06, accent(p), 0.85);
  box(c, 0, 0, 0.045, 1, accent(p), 0.85);
  box(c, 0.955, 0, 0.045, 1, accent(p), 0.85);
  // vault arcs
  arc(c, 0.5, 0.62, 0.44, mixHex(light(p), mid(p), 0.45), 0.8);
  arc(c, 0.5, 0.58, 0.33, mixHex(light(p), mid(p), 0.2), 0.7);
  // central tondo
  c.out.push(
    `<circle cx="${(0.5 * c.W).toFixed(1)}" cy="${(0.46 * c.H).toFixed(1)}" ` +
      `r="${(0.26 * c.W).toFixed(1)}" fill="${mixHex(light(p), accent(p), 0.28)}" opacity="0.9"/>`,
  );
  // figures wheeling round the tondo
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + c.rnd() * 0.3;
    const r = 0.1 + c.rnd() * 0.13;
    blob(
      c,
      0.5 + Math.cos(a) * r,
      0.46 + Math.sin(a) * r * (c.W / c.H),
      0.035 + c.rnd() * 0.03,
      0.04 + c.rnd() * 0.035,
      c.rnd() > 0.5 ? mixHex(mid(p), light(p), 0.4) : mixHex(mid(p), accent(p), 0.4),
      0.6,
      c.rnd() * 180,
    );
  }
  // the luminous centre
  blob(c, 0.5, 0.44, 0.1, 0.1, shiftHex(light(p), 26), 0.85);
  focal(c, 0.5, 0.46, 0.3); // the tondo and its figures
  brushwork(c, 170, 0.8);
}

function drawStillLife(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, mixHex(dark(p), mid(p), 0.4));
  band(c, 0, 0.55, mid(p));
  // cloth
  blob(c, 0.5, 0.72, 0.55, 0.24, light(p), 0.92);
  blob(c, 0.24, 0.68, 0.2, 0.1, shiftHex(light(p), 14), 0.7);
  // objects
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = 0.18 + (i / (n - 1)) * 0.64 + (c.rnd() - 0.5) * 0.06;
    const y = 0.58 + (c.rnd() - 0.5) * 0.12;
    const r = 0.075 + c.rnd() * 0.045;
    blob(c, x, y + r * 0.5, r * 1.05, r * 0.4 * (c.W / c.H), dark(p), 0.4); // cast shadow
    blob(c, x, y, r, r * (c.W / c.H), accent(p), 0.98);
    blob(c, x - r * 0.32, y - r * 0.34, r * 0.42, r * 0.42 * (c.W / c.H), shiftHex(accent(p), 52), 0.7);
  }
  // a jug or bowl
  blob(c, 0.68, 0.46, 0.13, 0.19, mixHex(light(p), mid(p), 0.25), 0.98);
  blob(c, 0.63, 0.42, 0.05, 0.09, shiftHex(light(p), 24), 0.6);
  focal(c, 0.45, 0.6, 0.32); // the fruit
  focal(c, 0.68, 0.48, 0.16); // the jug
  brushwork(c, 140, 0.7);
}

function drawRegister(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, light(p));
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y0 = 0.04 + (r / rows) * 0.92;
    const h = 0.92 / rows - 0.02;
    // register ground
    box(c, 0.04, y0, 0.92, h, mixHex(light(p), mid(p), r % 2 ? 0.22 : 0.1), 0.9);
    // rules
    box(c, 0.04, y0 + h, 0.92, 0.006, mixHex(mid(p), dark(p), 0.5), 0.8);
    // the marks — figures, hieroglyphs, columns of characters
    const marks = 14 + Math.floor(c.rnd() * 8);
    for (let i = 0; i < marks; i++) {
      const x = 0.06 + (i / marks) * 0.88;
      const tall = c.rnd() > 0.65;
      box(
        c,
        x,
        y0 + h * (tall ? 0.15 : 0.4),
        0.014 + c.rnd() * 0.02,
        h * (tall ? 0.7 : 0.42),
        c.rnd() > 0.75 ? accent(p) : mixHex(dark(p), mid(p), c.rnd() * 0.5),
        0.85,
      );
    }
  }
  // a larger principal figure breaking the registers
  blob(c, 0.24, 0.5, 0.1, 0.26, mixHex(dark(p), accent(p), 0.4), 0.85);
  blob(c, 0.24, 0.3, 0.05, 0.055, mid(p), 0.9);
  focal(c, 0.24, 0.44, 0.2); // the principal figure
  focal(c, 0.66, 0.5, 0.3); // the densest columns of marks
  brushwork(c, 90, 0.6);
}

function drawWave(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, light(p));
  band(c, 0.42, 1, mixHex(light(p), mid(p), 0.5));
  // the great mass rearing from the left
  c.out.push(
    `<path d="M0,${(0.9 * c.H).toFixed(1)} C${(0.1 * c.W).toFixed(1)},${(0.35 * c.H).toFixed(1)} ` +
      `${(0.42 * c.W).toFixed(1)},${(0.1 * c.H).toFixed(1)} ${(0.66 * c.W).toFixed(1)},${(0.3 * c.H).toFixed(1)} ` +
      `C${(0.5 * c.W).toFixed(1)},${(0.42 * c.H).toFixed(1)} ${(0.34 * c.W).toFixed(1)},${(0.62 * c.H).toFixed(1)} ` +
      `0,${c.H} Z" fill="${dark(p)}" opacity="0.92"/>`,
  );
  // the foam claw
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    blob(
      c,
      0.14 + t * 0.5 + c.rnd() * 0.04,
      0.34 - Math.sin(t * Math.PI) * 0.16 + c.rnd() * 0.05,
      0.02 + c.rnd() * 0.035,
      0.02 + c.rnd() * 0.03,
      accent(p),
      0.9,
    );
  }
  // second swell, right
  blob(c, 0.86, 0.78, 0.24, 0.16, mixHex(dark(p), mid(p), 0.5), 0.85, -12);
  // trough
  blob(c, 0.6, 0.72, 0.3, 0.12, mixHex(mid(p), light(p), 0.4), 0.7);
  // the small far peak
  blob(c, 0.56, 0.56, 0.09, 0.045, mixHex(mid(p), dark(p), 0.4), 0.85);
  focal(c, 0.36, 0.26, 0.3); // the claw of foam
  focal(c, 0.58, 0.68, 0.22); // the trough
  brushwork(c, 150, 0.85);
}

function drawArchitectural(c: Ctx) {
  const p = c.pal;
  band(c, 0, 1, mixHex(mid(p), dark(p), 0.35));
  // receding arches toward a bright centre
  for (let i = 4; i >= 0; i--) {
    const t = i / 4;
    const r = 0.16 + t * 0.3;
    const col = mixHex(light(p), mid(p), t * 0.7);
    arc(c, 0.5, 0.56 + t * 0.06, r, col, 0.95);
  }
  // the open sky at the vanishing point
  blob(c, 0.5, 0.44, 0.11, 0.13, shiftHex(light(p), 34), 0.95);
  // floor
  band(c, 0.72, 1, mixHex(mid(p), dark(p), 0.5));
  box(c, 0, 0.72, 1, 0.014, light(p), 0.6);
  // steps
  for (let s = 0; s < 3; s++) {
    box(c, 0.1 + s * 0.02, 0.74 + s * 0.06, 0.8 - s * 0.04, 0.03, mixHex(mid(p), light(p), 0.3), 0.6);
  }
  // the crowd of figures along the steps
  for (let i = 0; i < 14; i++) {
    const x = 0.08 + c.rnd() * 0.84;
    const y = 0.6 + c.rnd() * 0.26;
    const s = 0.7 + c.rnd() * 0.6;
    blob(
      c,
      x,
      y + 0.09 * s,
      0.035 * s,
      0.09 * s,
      i % 4 === 0 ? accent(p) : mixHex(dark(p), mid(p), 0.3 + c.rnd() * 0.4),
      0.92,
    );
    blob(c, x, y - 0.01 * s, 0.021 * s, 0.024 * s, light(p), 0.9);
  }
  focal(c, 0.5, 0.46, 0.2); // the vanishing point
  focal(c, 0.5, 0.74, 0.4); // the crowd on the steps
  brushwork(c, 170);
}

/**
 * A second, unblurred pass of small strokes laid over the softened masses.
 *
 * This is not decoration. build-glyphs sizes each glyph by the local variance
 * of the image, so a picture that is soft everywhere subdivides to a uniform
 * grid and every glyph comes out the same size — the corridor then reads as
 * graph paper rather than as a painting. Real brushwork gives the quadtree
 * something to find. The strokes are kept small and low-contrast enough to
 * read as surface, and they are drawn outside the blur so their edges survive.
 */
function fineWork(c: Ctx, count: number) {
  const midTone = mid(c.pal);
  let angle = c.rnd() * 180;
  for (let i = 0; i < count; i++) {
    if (i % 5 === 0) angle = c.rnd() * 180;

    // most of the work goes into the declared focal passages; the remainder
    // is scattered, so flat fields stay flat and subdivide into large glyphs
    let x: number;
    let y: number;
    let strength: number;
    if (c.focus.length && c.rnd() < 0.82) {
      const f = c.focus[Math.floor(c.rnd() * c.focus.length)];
      const a = c.rnd() * Math.PI * 2;
      const d = Math.sqrt(c.rnd()) * f.r;
      x = f.x + Math.cos(a) * d;
      y = f.y + Math.sin(a) * d * (c.W / c.H);
      strength = 1;
    } else {
      x = c.rnd();
      y = c.rnd();
      strength = 0.45;
    }

    const col = c.pal[Math.floor(c.rnd() * c.pal.length)];
    blob(
      c,
      x,
      y,
      (0.003 + c.rnd() * 0.009) * (0.7 + strength * 0.6),
      0.0012 + c.rnd() * 0.0035,
      shiftHex(mixHex(col, midTone, 0.5), (c.rnd() - 0.5) * 28 * strength),
      (0.09 + c.rnd() * 0.13) * strength,
      angle + (c.rnd() - 0.5) * 30,
    );
  }
}

const ARCHETYPES: Record<Archetype, (c: Ctx) => void> = {
  portrait: drawPortrait,
  'figure-group': drawFigureGroup,
  landscape: drawLandscape,
  nocturne: drawNocturne,
  interior: drawInterior,
  fresco: drawFresco,
  'still-life': drawStillLife,
  register: drawRegister,
  wave: drawWave,
  architectural: drawArchitectural,
};

/* ── entry point ───────────────────────────────────────────────────────── */

/** Long edge of the generated stand-in, px. */
const LONG_EDGE = 1500;

export function renderPlaceholder(spec: PlaceholderSpec): string {
  const aspect = spec.aspect > 0 ? spec.aspect : 1;
  const W = aspect >= 1 ? LONG_EDGE : Math.round(LONG_EDGE * aspect);
  const H = aspect >= 1 ? Math.round(LONG_EDGE / aspect) : LONG_EDGE;

  const rnd = mulberry32((spec.seed ?? 1) * 2654435761);
  const pal = spec.palette.length >= 3 ? spec.palette : ['#2b2620', '#6b5f4e', '#cdbfa4'];
  const c: Ctx = { W, H, rnd, pal, out: [], focus: [] };

  (ARCHETYPES[spec.archetype] ?? drawLandscape)(c);
  // the masses drawn so far get blurred; the fine pass afterwards does not
  const masses = c.out.join('');
  c.out.length = 0;
  fineWork(c, 1100);
  const surface = c.out.join('');

  // a blurred field of masses reads as paint, a sharp one reads as vector art
  const blur = Math.round(LONG_EDGE / 110);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<defs>',
    `<filter id="soft" x="-6%" y="-6%" width="112%" height="112%">`,
    `<feGaussianBlur stdDeviation="${blur}"/>`,
    '</filter>',
    `<filter id="tooth" x="0" y="0" width="100%" height="100%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${spec.seed ?? 1}"/>`,
    `<feColorMatrix type="saturate" values="0"/>`,
    '</filter>',
    `<radialGradient id="vig" cx="0.5" cy="0.46" r="0.78">`,
    `<stop offset="0.45" stop-color="#000" stop-opacity="0"/>`,
    `<stop offset="1" stop-color="#000" stop-opacity="0.34"/>`,
    '</radialGradient>',
    '</defs>',
    `<rect width="${W}" height="${H}" fill="${pal[0]}"/>`,
    `<g filter="url(#soft)">${masses}</g>`,
    `<g>${surface}</g>`,
    // canvas tooth: a faint noise layer so flat fields still carry variance
    `<rect width="${W}" height="${H}" filter="url(#tooth)" opacity="0.04"/>`,
    `<rect width="${W}" height="${H}" fill="url(#vig)"/>`,
    '</svg>',
  ].join('');
}
