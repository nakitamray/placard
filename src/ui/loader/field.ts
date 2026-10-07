/**
 * The museum doorway's wall of text, drawn without touching the page.
 *
 * Everything here works on a bare 2D context and plain numbers — no window, no
 * DOM, no React — because it normally runs in a worker (see worker.ts). That
 * is the point of it. The moment a museum's corridor is first built and drawn
 * is the heaviest thing this site ever asks of the main thread: the scene
 * graph is assembled, ten pictures are uploaded to the GPU and their mipmaps
 * built, and the driver links the room's programs. Nothing can make that
 * free, and for as long as it lasts nothing else on the main thread moves —
 * which is exactly the split-second freeze that showed up halfway through the
 * wall. Drawn from a worker into an OffscreenCanvas, the wall goes on
 * breathing and lighting straight through it.
 *
 * Where a browser cannot hand a canvas to a worker, the same code runs on the
 * main thread instead (see MuseumLoader), freeze and all, which is still a
 * working doorway.
 */

export interface FieldOptions {
  reduced: boolean;
  /** a cursor exists, so the lamp is worth drawing */
  lampOn: boolean;
}

export interface FieldState {
  progress: number;
  corpus: string;
  name: string;
}

export type FieldEvent = 'written' | 'filled';

/** one character cell, in CSS pixels — the entrance curtain's own grid */
const CELL = 19;
const CHAR_RATE = 6;
/** the wall at rest is a slow thing; the lamp and the movements want more */
const HOLD_HZ = 30;
/** how long the wall takes to write itself across the screen */
const IN_S = 0.55;
/** how long the light takes to finish the wall once everything is in */
const FILL_S = 0.7;
/** the soft edge of the light, as a fraction of the wall */
const EDGE = 0.08;
/** never full for less than this, so a cached wing still has its moment */
const MIN_SHOW_S = 0.9;
/** the lamp under the cursor, in CSS pixels */
const LAMP_R = 150;

const GROUND = '#15120e';
const WORD = 'rgba(201,162,39,0.95)';

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

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createField(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: FieldOptions,
  emit: (e: FieldEvent) => void,
  frame: (cb: (now: number) => void) => unknown,
  now: () => number,
) {
  const ctx = canvas.getContext('2d') as Ctx | null;
  const state: FieldState = { progress: 0, corpus: ' ', name: '' };
  const lampAt = { x: -1e4, y: -1e4 };
  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let started = -1;
  let lastDraw = 0;
  let lit = 0;
  let finishedAt = 0;
  let litAtFinish = 0;
  let written = false;
  let filled = false;
  let stopped = false;

  const resize = (cssW: number, cssH: number, dpr: number) => {
    if (!ctx) return;
    w = cssW;
    h = cssH;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `${CELL - 5}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    cols = Math.ceil(w / CELL);
    rows = Math.ceil(h / CELL);
    lastDraw = 0;
  };

  const draw = (at: number) => {
    if (!ctx) return;
    const t = (at - started) / 1000;
    const { reduced, lampOn } = opts;

    // IN: how far the wall has written itself (a little past 1, for the soft front)
    const inK = reduced ? 2 : (t / IN_S) * 1.15;
    if (!written && inK >= 1.15) {
      written = true;
      emit('written');
    }

    // the light follows the steps in, then sweeps the rest on a clock
    lit += (state.progress * 0.85 - lit) * (reduced ? 1 : 0.12);
    if (state.progress >= 1 && t >= MIN_SHOW_S) {
      if (!finishedAt) {
        finishedAt = at;
        litAtFinish = lit;
      }
      const k = reduced ? 1 : clamp01((at - finishedAt) / 1000 / FILL_S);
      lit = Math.max(lit, litAtFinish + (1 + EDGE - litAtFinish) * k);
      if (k >= 1 && !filled) {
        filled = true;
        emit('filled');
      }
    }

    ctx.clearRect(0, 0, w, h);
    const covered = inK >= 1.15;
    if (covered) {
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, 0, w, h);
    }

    const text = state.corpus || ' ';
    const name = state.name;
    const charOffset = reduced ? 0 : Math.floor(t * CHAR_RATE);
    const breath = t * 1.4;
    const total = cols * rows;
    const wordRow = Math.floor(rows / 2);
    const wordCol = Math.max(0, Math.floor((cols - name.length) / 2));
    const plaqueFrom = wordCol - 3;
    const plaqueTo = wordCol + name.length + 3;
    const fast = Math.floor(t * 18);

    for (let row = 0; row < rows; row++) {
      const y = row * CELL + CELL / 2;
      const inWordRow = row === wordRow;
      // each row starts a touch later than the one above, so the wall is written
      const rowStart = (row / rows) * 0.8;
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const x = col * CELL + CELL / 2;

        let a = 1;
        if (!covered) {
          const front = rowStart + (col / cols) * 0.2;
          a = smooth(front, front + 0.12, inK);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = GROUND;
          ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
        }

        const isWord = inWordRow && col >= wordCol && col < wordCol + name.length;
        let lamp = 0;
        if (lampOn) {
          const d = Math.hypot(x - lampAt.x, y - lampAt.y);
          if (d < LAMP_R) lamp = 1 - d / LAMP_R;
        }
        // under the lamp the letters run faster, as if read more quickly
        const ch = isWord
          ? name[col - wordCol]
          : text[(i + charOffset + (lamp > 0.25 ? fast : 0)) % text.length];
        if (ch === ' ') continue;

        ctx.globalAlpha = a;
        if (isWord) {
          ctx.fillStyle = WORD;
        } else {
          const level = clamp01((lit - i / total) / EDGE);
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

  const tick = (at: number) => {
    if (stopped) return;
    frame(tick);
    if (started < 0) started = at;
    // writing in and the final sweep want every frame; the wall at rest does not
    const moving = !written || (finishedAt && !filled);
    if (!moving && at - lastDraw < 1000 / HOLD_HZ) return;
    lastDraw = at;
    draw(at);
  };

  return {
    start(cssW: number, cssH: number, dpr: number) {
      resize(cssW, cssH, dpr);
      started = now();
      draw(started);
      frame(tick);
    },
    resize,
    set(next: Partial<FieldState>) {
      Object.assign(state, next);
    },
    lamp(x: number, y: number) {
      lampAt.x = x;
      lampAt.y = y;
    },
    stop() {
      stopped = true;
    },
  };
}

export type Field = ReturnType<typeof createField>;

/** what the page sends the worker */
export type ToWorker =
  | { type: 'start'; canvas: OffscreenCanvas; w: number; h: number; dpr: number; opts: FieldOptions }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'state'; state: Partial<FieldState> }
  | { type: 'lamp'; x: number; y: number }
  | { type: 'stop' };
