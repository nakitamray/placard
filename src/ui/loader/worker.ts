/**
 * The museum doorway's own thread — see field.ts for why it has one.
 */
import { createField, type Field, type ToWorker } from './field';

type WorkerScope = typeof globalThis & {
  requestAnimationFrame?: (cb: (now: number) => void) => number;
  postMessage: (m: unknown) => void;
};
const scope = self as unknown as WorkerScope;

// a worker's own animation frame where the browser gives it one, else a timer
const frame = (cb: (now: number) => void) =>
  scope.requestAnimationFrame
    ? scope.requestAnimationFrame(cb)
    : setTimeout(() => cb(performance.now()), 16);

let field: Field | null = null;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'start') {
    field = createField(m.canvas, m.opts, (ev) => scope.postMessage(ev), frame, () =>
      performance.now(),
    );
    field.start(m.w, m.h, m.dpr);
  } else if (m.type === 'resize') field?.resize(m.w, m.h, m.dpr);
  else if (m.type === 'state') field?.set(m.state);
  else if (m.type === 'lamp') field?.lamp(m.x, m.y);
  else if (m.type === 'stop') {
    field?.stop();
    field = null;
    self.close();
  }
};
