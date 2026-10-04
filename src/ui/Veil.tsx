/**
 * The veil between the corridor and a painting's room.
 *
 * Walking into a painting used to be a camera dive through the end wall and a
 * white flash, the best part of two seconds every time — and on the way to the
 * one thing a visitor had just asked to see. Now the corridor dims out in a
 * blink, the room is set behind the dark, and it comes up as soon as its
 * painting is ready to be drawn. The cut is hidden, and nothing is waited on
 * that does not have to be.
 *
 * Imperative and DOM-only, like the frame loop it sits over: nothing here is
 * worth a React render.
 */
let el: HTMLDivElement | null = null;
let failsafe = 0;

/** how long the veil may stay down before it lifts whatever the room says */
const MAX_HOLD_MS = 1800;

export function VeilLayer() {
  return (
    <div
      ref={(r) => {
        el = r;
      }}
      className="veil"
      aria-hidden
    />
  );
}

/** dim to the room colour over `ms`, and lift on its own if nobody else does */
export function coverVeil(ms: number, colour = '#15120e') {
  if (!el) return;
  el.style.background = colour;
  el.style.transition = `opacity ${ms}ms ease-in`;
  el.style.opacity = '1';
  window.clearTimeout(failsafe);
  failsafe = window.setTimeout(() => liftVeil(400), MAX_HOLD_MS);
}

/** bring the room up from under the veil */
export function liftVeil(ms: number) {
  window.clearTimeout(failsafe);
  if (!el || el.style.opacity !== '1') return;
  el.style.transition = `opacity ${ms}ms ease-out`;
  el.style.opacity = '0';
}

/** whether the veil is down — the room uses it to know there is something to lift */
export function veilDown(): boolean {
  return !!el && el.style.opacity === '1';
}
