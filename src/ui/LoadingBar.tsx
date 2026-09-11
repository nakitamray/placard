/**
 * The entrance curtain: the exhibition's own material, before the exhibition.
 *
 * Every painting on this site is drawn out of a corpus of writing, stepped
 * through in reading order, breathing. That field is the one image the whole
 * project is about — so the thing covering the wait is not a description of
 * it, and not a bar with a word under it. It is the field itself, built out
 * of the only thing available before a single shader has compiled: characters
 * on a canvas.
 *
 * WHY NOT THE REAL ONE
 *   The real glyph field is WebGL, and the compile it needs is precisely what
 *   this screen exists to hide. So this is the same mechanism written the
 *   cheap way — the same six characters a second (`CHAR_RATE` in
 *   glyph/GlyphPrePass), the same slow breath at 1.4 — drawn with `fillText`
 *   into a 2D context that needs no program built for it and can start on the
 *   first frame of the page.
 *
 * WHERE THE PROGRESS IS
 *   In the text. Nothing on this screen is a progress bar, because a progress
 *   bar is furniture and this site does not have furniture. The wall lights
 *   from the top left in reading order as the three steps report in, dim bone
 *   turning to gilt through a soft edge, so what is filling is the writing —
 *   and the words naming the step are gilt characters standing in the same
 *   grid, stepping and breathing with everything around them. Read together:
 *   the text is being lit, and it says what it is waiting for.
 *
 * It is darker than the exhibition's own ink, so the room it uncovers arrives
 * as a light coming up rather than as a cut.
 */
import { useEffect, useRef } from 'react';
import { BOOT_STEPS, bootProgress, bootWaitingFor, useBoot } from '../state/boot';

/**
 * The wall's text.
 *
 * The real corpora are per-artwork binaries that have not been fetched at
 * this point in the page's life, so this is a passage of its own — and it is
 * prose rather than a shuffled alphabet, because at this cell size the eye
 * reads texture, and the texture of real words is not the texture of random
 * letters. Word lengths and the spaces between them are most of what makes a
 * wall of type look like writing.
 */
const CORPUS =
  'the picture is made of the words written about it and the words are read in the order ' +
  'the eye takes them a letter at a time across the canvas until the paint comes back ' +
  'through and what was a page of description becomes again a woman at a window a field ' +
  'of grain a river under a bridge in the evening light of a room somebody has written ' +
  'down for us to stand in front of and look at slowly and for as long as we like ';

/** one character cell, in CSS pixels — big enough that 2D text stays cheap */
const CELL = 19;
/** characters a second through the corpus — the glyph field's own rate */
const CHAR_RATE = 6;
/** how often the wall is redrawn; the corpus only steps six times a second */
const REDRAW_HZ = 12;
/** how wide the lit edge is, as a fraction of the whole wall */
const EDGE = 0.08;

/** dim bone → gilt, quantised, so the loop never builds a colour string */
const LEVELS = 10;
const PALETTE = (() => {
  const out: string[] = [];
  for (let i = 0; i < LEVELS; i++) {
    // 0 is the unlit wall, LEVELS-1 is fully lit gilt
    const t = i / (LEVELS - 1);
    const r = Math.round(226 + (201 - 226) * t);
    const g = Math.round(219 + (162 - 219) * t);
    const b = Math.round(202 + (39 - 202) * t);
    /*
     * The span has to be wide. Bone at a low alpha and gilt at a low alpha
     * are the same brown on this ground — the colour ramp alone says nothing,
     * and the first version of this read as one flat wall with no progress in
     * it at all. It is the alpha that carries the light, from barely-there to
     * unmistakably lit, and the hue rides along with it.
     */
    const a = 0.045 + t * t * 0.78;
    out.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
  }
  return out;
})();
/** the words naming the step sit above the wall's brightness, always legible */
const WORD = 'rgba(201,162,39,0.92)';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function LoadingBar({ closing = false }: { closing?: boolean }) {
  const done = useBoot((s) => s.done);
  const canvas = useRef<HTMLCanvasElement>(null);
  /*
   * Progress is read inside the draw loop rather than closed over, so a step
   * reporting in does not restart the animation — the wall must not stutter
   * at the exact moment it has something to show.
   */
  const progress = useRef(0);
  progress.current = bootProgress(done);
  const waiting = bootWaitingFor(done);
  const label = (waiting ? waiting.label : 'Opening').toUpperCase();
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d', { alpha: false });
    if (!ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let lastDraw = 0;
    const started = performance.now();
    /** eases toward the reported progress, so the light moves rather than jumps */
    let lit = 0;

    const resize = () => {
      // capped: this is a full-screen grid of text and a retina phone would
      // ask for four times the fillText calls for no legibility gained
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

      // the light eases toward whatever has reported in
      lit += (progress.current - lit) * (reduced ? 1 : 0.09);

      ctx.fillStyle = '#15120e';
      ctx.fillRect(0, 0, w, h);

      const charOffset = reduced ? 0 : Math.floor(t * CHAR_RATE);
      const breath = t * 1.4;
      const total = cols * rows;

      /*
       * The words, placed on the grid before it is drawn, so they occupy real
       * cells and the wall steps around them rather than over them.
       */
      const text = labelRef.current;
      const wordRow = Math.floor(rows / 2);
      const wordCol = Math.max(0, Math.floor((cols - text.length) / 2));

      for (let row = 0; row < rows; row++) {
        const y = row * CELL + CELL / 2;
        const inWordRow = row === wordRow;
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const x = col * CELL + CELL / 2;

          if (inWordRow && col >= wordCol && col < wordCol + text.length) {
            const ch = text[col - wordCol];
            if (ch !== ' ') {
              // breathing with the wall, but never dimmer than readable
              const b = reduced ? 1 : 0.86 + 0.14 * Math.sin(breath + i * 0.2);
              ctx.globalAlpha = b;
              ctx.fillStyle = WORD;
              ctx.fillText(ch, x, y);
              ctx.globalAlpha = 1;
            }
            continue;
          }

          /*
           * Consecutive cells take consecutive characters, so each row reads
           * as the sentence it came from and the whole wall scrolls one
           * character at a time — which is what the paintings do, and the
           * reason the corpus is prose rather than an alphabet. Striding
           * through it instead (every seventh character, as this first did)
           * turns the passage into noise that merely has the right letter
           * frequencies, and the eye can tell immediately.
           */
          const ch = CORPUS[(i + charOffset) % CORPUS.length];
          if (ch === ' ') continue;
          // reading order: top left is the beginning of the text
          const f = i / total;
          const level = clamp01((lit - f) / EDGE + (reduced ? 0 : 0));
          const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(breath + i * 0.21);
          // the breath modulates the lit level without ever darkening it to
          // nothing, so a lit region reads as lit even at the bottom of a breath
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
      if (now - lastDraw < 1000 / REDRAW_HZ) return;
      lastDraw = now;
      draw(now);
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduced) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(tick);
    }
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={`loading ${closing ? 'is-closing' : ''}`}
      role="status"
      aria-label={`Preparing the gallery — ${done.length} of ${BOOT_STEPS.length}`}
    >
      <canvas ref={canvas} className="loading-field" aria-hidden />
    </div>
  );
}
