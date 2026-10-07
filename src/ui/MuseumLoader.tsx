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
 *   IN      The wall writes itself across the entrance in reading order, row
 *           over row, in about half a second.
 *
 *   HOLD    While the plan, the paintings and the room's shaders load, the
 *           light runs through the text. The cursor is a lamp held up to the
 *           wall: the letters under it light and run faster.
 *
 *   OUT     When everything is in, the wall fades, slowly, over a corridor
 *           that has already been drawing underneath it, while the walk in
 *           from the doorway begins.
 *
 * The wall itself is drawn on its own thread where the browser allows it (see
 * loader/field.ts), so the corridor being built behind it cannot freeze it.
 */
import { useEffect, useRef } from 'react';
import { OPENING_STEPS, useOpening } from '../state/opening';
import { createField, type FieldEvent, type ToWorker } from './loader/field';
import { pointer } from '../state/motion';

/** never longer than this, whatever has or has not reported */
const MAX_SHOW_MS = 12000;
/** the stylesheet's fade, plus a beat */
const FADE_MS = 1000;

export function MuseumLoader() {
  const museum = useOpening((s) => s.museum);
  const words = useOpening((s) => s.words);
  const done = useOpening((s) => s.done);
  const closing = useOpening((s) => s.closing);
  const holder = useRef<HTMLDivElement>(null);
  /** how to tell the wall something, wherever it is being drawn */
  const send = useRef<(m: ToWorker) => void>(() => {});

  const progress = done.length / OPENING_STEPS.length;
  const corpus = words ?? (museum ? `${museum.name} · ${museum.city} · ` : ' ');
  const name = museum ? museum.name.toUpperCase() : '';

  // a doorway that never opens is worse than the stutter it hides
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
    send.current({ type: 'state', state: { progress, corpus, name } });
  }, [progress, corpus, name]);

  useEffect(() => {
    const host = holder.current;
    if (!host || !museum) return;
    /*
     * A canvas made here rather than rendered: one handed to a worker can
     * never be drawn on again from this side, and every run of this effect —
     * including the second one development mode makes — needs a clean one.
     */
    const el = document.createElement('canvas');
    el.className = 'loading-field';
    el.setAttribute('aria-hidden', 'true');
    host.appendChild(el);

    const opts = {
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      lampOn: matchMedia('(pointer: fine)').matches,
    };
    const dims = () => ({
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    const onEvent = (ev: FieldEvent) => {
      const s = useOpening.getState();
      if (ev === 'written') s.write();
      else if (ev === 'filled') s.close();
    };
    const sizeElement = () => {
      el.style.width = `${window.innerWidth}px`;
      el.style.height = `${window.innerHeight}px`;
    };
    sizeElement();

    let worker: Worker | null = null;
    let stop = () => {};
    const off = 'transferControlToOffscreen' in el;
    if (off) {
      try {
        worker = new Worker(new URL('./loader/worker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker = null;
      }
    }
    if (worker) {
      const w = worker;
      w.onmessage = (e: MessageEvent<FieldEvent>) => onEvent(e.data);
      const offscreen = el.transferControlToOffscreen();
      const d = dims();
      w.postMessage({ type: 'start', canvas: offscreen, ...d, opts } satisfies ToWorker, [
        offscreen,
      ]);
      send.current = (m) => w.postMessage(m);
      stop = () => w.postMessage({ type: 'stop' } satisfies ToWorker);
    } else {
      // no worker canvas here: the same wall, drawn on the main thread
      const field = createField(
        el,
        opts,
        onEvent,
        (cb) => requestAnimationFrame(cb),
        () => performance.now(),
      );
      const d = dims();
      field.start(d.w, d.h, d.dpr);
      send.current = (m) => {
        if (m.type === 'state') field.set(m.state);
        else if (m.type === 'lamp') field.lamp(m.x, m.y);
        else if (m.type === 'resize') field.resize(m.w, m.h, m.dpr);
      };
      stop = () => field.stop();
    }
    // whatever the store already holds, before the first message from it
    const s = useOpening.getState();
    send.current({
      type: 'state',
      state: {
        progress: s.done.length / OPENING_STEPS.length,
        corpus: s.words ?? `${museum.name} · ${museum.city} · `,
        name: museum.name.toUpperCase(),
      },
    });

    // the lamp starts where the cursor already is, not where it next moves
    send.current({
      type: 'lamp',
      x: (pointer.x * 0.5 + 0.5) * window.innerWidth,
      y: (pointer.y * 0.5 + 0.5) * window.innerHeight,
    });

    const onResize = () => {
      sizeElement();
      send.current({ type: 'resize', ...dims() });
    };
    const onMove = (e: PointerEvent) => send.current({ type: 'lamp', x: e.clientX, y: e.clientY });
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      stop();
      send.current = () => {};
      el.remove();
    };
  }, [museum]);

  if (!museum) return null;

  return (
    <div
      className={`museum-loader ${closing ? 'is-closing' : ''}`}
      role="status"
      aria-label={`Opening ${museum.name} — ${done.length} of ${OPENING_STEPS.length}`}
    >
      <div ref={holder} className="museum-loader-field" aria-hidden />
    </div>
  );
}
