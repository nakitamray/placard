/**
 * The screen between the entrance and a museum's corridor.
 *
 * A cousin of the entrance curtain (ui/LoadingBar), not a copy of it. The
 * curtain is a wall of anonymous prose lighting in reading order; this one is
 * made of the museum itself — the names of the painters who hang there and
 * the titles of what they painted, stepping through at the glyph field's own
 * six characters a second — and it lights from the middle outward, the way a
 * room does when somebody finds the switch, around the name of the place you
 * are walking into.
 *
 * The light follows the three steps in state/opening. Once they are all in,
 * it sweeps out to the corners on a clock and the screen fades over a
 * corridor that has already been drawing underneath it.
 */
import { useEffect, useRef } from 'react';
import { OPENING_STEPS, useOpening } from '../state/opening';

/** one character cell, in CSS pixels — the curtain's own grid */
const CELL = 19;
const CHAR_RATE = 6;
const REDRAW_HZ = 12;
/** the soft edge of the light, as a fraction of the screen's half-diagonal */
const EDGE = 0.22;
/** how long the light takes to reach the corners once everything is in */
const SWEEP_S = 0.6;
/** never on screen for less than this, so a cached wing is a beat, not a flicker */
const MIN_SHOW_MS = 650;
/** and never longer than this, whatever has or has not reported */
const MAX_SHOW_MS = 12000;
/** the stylesheet's fade, plus a frame */
const FADE_MS = 720;

const LEVELS = 10;
const PALETTE = (() => {
  const out: string[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const t = i / (LEVELS - 1);
    const r = Math.round(226 + (201 - 226) * t);
    const g = Math.round(219 + (162 - 219) * t);
    const b = Math.round(202 + (39 - 202) * t);
    const a = 0.04 + t * t * 0.62;
    out.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
  }
  return out;
})();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function MuseumLoader() {
  const museum = useOpening((s) => s.museum);
  const words = useOpening((s) => s.words);
  const done = useOpening((s) => s.done);
  const closing = useOpening((s) => s.closing);
  const canvas = useRef<HTMLCanvasElement>(null);

  const progress = useRef(0);
  progress.current = done.length / OPENING_STEPS.length;
  const corpus = useRef('');
  corpus.current =
    words ?? (museum ? `${museum.name} · ${museum.subtitle} · ${museum.city} · ` : '');
  const step = OPENING_STEPS.find((s) => !done.includes(s.key));

  // a screen that waits forever is worse than the stutter it is hiding: the
  // corridor copes with a missing texture, so the door opens regardless
  useEffect(() => {
    if (!museum) return;
    const failsafe = window.setTimeout(() => useOpening.getState().close(), MAX_SHOW_MS);
    return () => window.clearTimeout(failsafe);
  }, [museum]);

  // once it has faded, it is gone
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => useOpening.getState().clear(), FADE_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !museum) return;
    const ctx = el.getContext('2d', { alpha: false });
    if (!ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let lastDraw = 0;
    const started = performance.now();
    let lit = 0;
    let finishedAt = 0;
    let litAtFinish = 0;
    let reported = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      lastDraw = 0;
    };

    const draw = (now: number) => {
      const t = (now - started) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // a third of the way out per step, eased so the light moves rather than jumps
      lit += (progress.current * 0.62 - lit) * (reduced ? 1 : 0.1);
      if (progress.current >= 1 && now - started >= MIN_SHOW_MS) {
        if (!finishedAt) {
          finishedAt = now;
          litAtFinish = lit;
        }
        const k = reduced ? 1 : clamp01((now - finishedAt) / 1000 / SWEEP_S);
        lit = Math.max(lit, litAtFinish + (1 + EDGE - litAtFinish) * k * k);
        if (!reported && k >= 1) {
          reported = true;
          useOpening.getState().close();
        }
      }

      ctx.fillStyle = '#15120e';
      ctx.fillRect(0, 0, w, h);

      const text = corpus.current || ' ';
      const charOffset = reduced ? 0 : Math.floor(t * CHAR_RATE);
      const breath = t * 1.4;
      const cx = w / 2;
      const cy = h / 2;
      const reach = Math.hypot(cx, cy);

      for (let row = 0; row < rows; row++) {
        const y = row * CELL + CELL / 2;
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const ch = text[(i + charOffset) % text.length];
          if (ch === ' ') continue;
          const x = col * CELL + CELL / 2;
          // distance from the middle, as a fraction of the way to a corner
          const f = Math.hypot(x - cx, (y - cy) * 1.35) / reach;
          const level = clamp01((lit - f) / EDGE);
          const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(breath + i * 0.21);
          const idx = Math.min(
            LEVELS - 1,
            Math.round(level * (LEVELS - 1) * (0.82 + 0.18 * breathe)),
          );
          ctx.fillStyle = PALETTE[idx];
          ctx.fillText(ch, x, y);
        }
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // the sweep at the end wants every frame; the field itself does not
      if (!finishedAt && now - lastDraw < 1000 / REDRAW_HZ) return;
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
      <div className="museum-loader-plaque" aria-hidden>
        <p className="caption museum-loader-city">{museum.city}</p>
        <h2 className="museum-loader-name">{museum.name}</h2>
        <p className="meta museum-loader-sub">{museum.subtitle}</p>
        <p className="caption museum-loader-step">{step ? step.label : 'Come in'}</p>
      </div>
    </div>
  );
}
