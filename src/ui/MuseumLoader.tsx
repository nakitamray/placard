/**
 * The doorway between the entrance and a museum's corridor.
 *
 * Built from the same stuff as the entrance curtain (ui/LoadingBar): a wall of
 * type stepping through its text at the glyph field's own six characters a
 * second, breathing, lighting from dim bone to gilt in reading order as the
 * work behind it reports in. The text here is the museum itself — who hangs
 * there and what they painted — and the only words standing still in it are
 * the museum's name.
 *
 * It has three movements, and none of them is a fade:
 *
 *   IN      The wall writes itself across the entrance in reading order, row
 *           over row, in about half a second — the click is answered by text
 *           arriving, not by a screen being put up.
 *
 *   HOLD    While the plan, the paintings and the room's shaders load, the
 *           light runs through the text. The cursor is a lamp held up to the
 *           wall: the letters under it light and run faster, so there is
 *           something to do with your hand while you wait.
 *
 *   OUT     When everything is in, the wall opens from the middle outward,
 *           each letter flaring gilt as it goes, and the corridor's walk in
 *           from the doorway starts at the same moment — so the room is
 *           something you pass through the text into, not something you are
 *           dropped in front of.
 */
import { useEffect, useRef } from 'react';
import { OPENING_STEPS, useOpening } from '../state/opening';
import { pointer } from '../state/motion';

/** one character cell, in CSS pixels — the curtain's own grid */
const CELL = 19;
const CHAR_RATE = 6;
/** the wall at rest is a slow thing; the lamp and the movements want more */
const HOLD_HZ = 30;
/** how long the wall takes to write itself across the screen */
const IN_S = 0.55;
/** how long the light takes to finish the wall once everything is in */
const FILL_S = 0.7;
/** how long the wall takes to open */
const OUT_S = 1.35;
/** the soft edge of the light, as a fraction of the wall */
const EDGE = 0.08;
/** never on screen for less than this, so a cached wing still has its moment */
const MIN_SHOW_MS = 900;
/** and never longer, whatever has or has not reported */
const MAX_SHOW_MS = 12000;
/** the lamp under the cursor, in CSS pixels */
const LAMP_R = 150;

const GROUND = '#15120e';
const WORD = 'rgba(201,162,39,0.95)';
const FLARE = 'rgba(255,226,140,0.95)';

const LEVELS = 12;
const PALETTE = (() => {
  const out: string[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const t = i / (LEVELS - 1);
    const r = Math.round(226 + (201 - 226) * t);
    const g = Math.round(219 + (162 - 219) * t);
    const b = Math.round(202 + (39 - 202) * t);
    const a = 0.05 + t * t * 0.8;
    out.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
  }
  return out;
})();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** a stable per-cell number in 0..1, so the wall opens the same way every frame */
const hash = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function MuseumLoader() {
  const museum = useOpening((s) => s.museum);
  const words = useOpening((s) => s.words);
  const done = useOpening((s) => s.done);
  const closing = useOpening((s) => s.closing);
  const canvas = useRef<HTMLCanvasElement>(null);

  // read inside the draw loop, so a step landing never restarts the animation
  const live = useRef({ progress: 0, corpus: '', name: '', closing: false });
  live.current.progress = done.length / OPENING_STEPS.length;
  live.current.corpus = words ?? (museum ? `${museum.name} · ${museum.city} · ` : ' ');
  live.current.name = museum ? museum.name.toUpperCase() : '';
  live.current.closing = closing;

  // a doorway that never opens is worse than the stutter it hides
  useEffect(() => {
    if (!museum) return;
    const failsafe = window.setTimeout(() => useOpening.getState().close(), MAX_SHOW_MS);
    return () => window.clearTimeout(failsafe);
  }, [museum]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !museum) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lampOn = !reduced && matchMedia('(pointer: fine)').matches;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let lastDraw = 0;
    const started = performance.now();
    let lit = 0;
    let finishedAt = 0;
    let litAtFinish = 0;
    let openedAt = 0;
    /** per-cell order for the opening, recomputed with the grid */
    let order = new Float32Array(0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `${CELL - 5}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      // the opening runs from the middle out, ragged so it reads as a wall
      // giving way letter by letter rather than as an iris
      order = new Float32Array(cols * rows);
      const cx = w / 2;
      const cy = h / 2;
      const reach = Math.hypot(cx, cy);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const d = Math.hypot(col * CELL + CELL / 2 - cx, (row * CELL + CELL / 2 - cy) * 1.4) / reach;
          order[i] = Math.min(1, d) * 0.72 + hash(i) * 0.28;
        }
      }
      lastDraw = 0;
    };

    const draw = (now: number) => {
      const t = (now - started) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const L = live.current;

      // IN: how far the wall has written itself, 0..1 (a little past, for the soft front)
      const inK = reduced ? 2 : (t / IN_S) * 1.15;

      // HOLD: the light follows the steps in, then sweeps the rest on a clock
      lit += (L.progress * 0.85 - lit) * (reduced ? 1 : 0.12);
      if (L.progress >= 1 && now - started >= MIN_SHOW_MS) {
        if (!finishedAt) {
          finishedAt = now;
          litAtFinish = lit;
        }
        const k = reduced ? 1 : clamp01((now - finishedAt) / 1000 / FILL_S);
        lit = Math.max(lit, litAtFinish + (1 + EDGE - litAtFinish) * k);
        if (k >= 1 && !L.closing) useOpening.getState().close();
      }

      // OUT: how far the wall has opened, 0..1
      if (L.closing && !openedAt) openedAt = now;
      const outK = openedAt ? (reduced ? 2 : (now - openedAt) / 1000 / OUT_S) : 0;
      if (outK >= 1.2) {
        useOpening.getState().clear();
        return;
      }

      ctx.clearRect(0, 0, w, h);
      const covered = inK >= 1.15 && !openedAt;
      if (inK >= 1.15) useOpening.getState().write();
      if (covered) {
        ctx.fillStyle = GROUND;
        ctx.fillRect(0, 0, w, h);
      }

      const text = L.corpus || ' ';
      const name = L.name;
      const charOffset = reduced ? 0 : Math.floor(t * CHAR_RATE);
      const breath = t * 1.4;
      const total = cols * rows;
      const wordRow = Math.floor(rows / 2);
      const wordCol = Math.max(0, Math.floor((cols - name.length) / 2));
      const plaqueFrom = wordCol - 3;
      const plaqueTo = wordCol + name.length + 3;
      // the lamp: the cursor in CSS pixels
      const px = (pointer.x * 0.5 + 0.5) * w;
      const py = (pointer.y * 0.5 + 0.5) * h;

      for (let row = 0; row < rows; row++) {
        const y = row * CELL + CELL / 2;
        const inWordRow = row === wordRow;
        // each row starts a touch later than the one above, so the wall is written
        const rowStart = (row / rows) * 0.8;
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const x = col * CELL + CELL / 2;

          // IN: is this cell written yet?
          let a = 1;
          if (!covered && inK < 1.15) {
            const front = rowStart + (col / cols) * 0.2;
            a = smooth(front, front + 0.12, inK);
            if (a <= 0) continue;
          }
          // OUT: has the wall opened here yet? Letters flare just before they go.
          let flare = 0;
          if (openedAt) {
            const o = order[i];
            const gone = smooth(o - 0.04, o + 0.06, outK);
            if (gone >= 1) continue;
            flare = 1 - Math.abs(gone * 2 - 1);
            a *= 1 - gone;
          }

          if (!covered) {
            ctx.globalAlpha = a;
            ctx.fillStyle = GROUND;
            ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
          }

          const isWord = inWordRow && col >= wordCol && col < wordCol + name.length;
          let lamp = 0;
          if (lampOn) {
            const d = Math.hypot(x - px, y - py);
            if (d < LAMP_R) lamp = 1 - d / LAMP_R;
          }
          // under the lamp the letters run faster, as if read more quickly
          const ch = isWord
            ? name[col - wordCol]
            : text[(i + charOffset + (lamp > 0.25 ? Math.floor(t * 18) : 0)) % text.length];
          if (ch === ' ') continue;

          ctx.globalAlpha = a;
          if (flare > 0.35) {
            ctx.fillStyle = FLARE;
          } else if (isWord) {
            ctx.fillStyle = WORD;
          } else {
            const f = i / total;
            const level = clamp01((lit - f) / EDGE);
            const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(breath + i * 0.21);
            const shade =
              Math.abs(row - wordRow) <= 1 && col >= plaqueFrom && col < plaqueTo ? 0.3 : 1;
            const v = Math.max(level * shade * (0.82 + 0.18 * breathe), lamp * 0.9);
            ctx.fillStyle = PALETTE[Math.min(LEVELS - 1, Math.round(v * (LEVELS - 1)))];
          }
          ctx.fillText(ch, x, y);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // the movements in and out want every frame; the wall at rest does not
      const moving = now - started < IN_S * 1000 + 100 || openedAt || finishedAt;
      if (!moving && now - lastDraw < 1000 / HOLD_HZ) return;
      lastDraw = now;
      draw(now);
    };

    resize();
    window.addEventListener('resize', resize);
    draw(performance.now());
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [museum]);

  if (!museum) return null;

  return (
    <div
      className={`museum-loader ${closing ? 'is-closing' : ''}`}
      role="status"
      aria-label={`Opening ${museum.name} — ${done.length} of ${OPENING_STEPS.length}`}
    >
      <canvas ref={canvas} className="loading-field" aria-hidden />
    </div>
  );
}
