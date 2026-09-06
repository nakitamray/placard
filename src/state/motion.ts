/**
 * Transient motion state, mutated per-frame and deliberately kept OUT of
 * React/Zustand so scroll and parallax never cause re-renders.
 */
export const pointer = { x: 0, y: 0 }; // normalised -1..1, raw target
export const corridor = {
  t: 0, // damped scroll progress 0..1
  goal: 0,
  mouth: 4, // T1 dolly offset: 4 (landing) → 0 (corridor)
};
export const warp = { p: 0 }; // T3 progress 0..1
export const gallery = {
  x: 0, // damped rail position (world units)
  goal: 0,
};

/**
 * Zoom — how close the visitor has chosen to stand.
 *
 * A gallery lets you walk up to a picture, and until now this one did not:
 * every work was seen from exactly one distance, decided for you. `goal` is
 * set by the controls, `v` is the damped value the camera reads, so a zoom
 * eases in like a step forward rather than snapping like a menu.
 *
 * 1 is the room as composed. Above that the corridor narrows its lens (a
 * telephoto look down the enfilade) and the gallery moves the camera in
 * toward the canvas, which is the honest way to get closer to a painting.
 */
export const view = { v: 1, goal: 1 };
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2.6;

function setZoom(next: number) {
  view.goal = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
}

function nudgeZoom(factor: number) {
  setZoom(view.goal * factor);
}

export function resetZoom() {
  view.v = 1;
  view.goal = 1;
}

export function resetCorridor(t = 0) {
  corridor.t = t;
  corridor.goal = t;
}

// debug/testing handle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__motion = {
    pointer,
    corridor,
    warp,
    gallery,
    view,
  };
}

/**
 * Zoom controls, attached once for the whole exhibition.
 *
 * Deliberately not the plain scroll wheel: the wheel already walks the
 * corridor and moves along the gallery rail, and quietly overloading it would
 * make both feel unreliable. So zoom is the two keys everyone already tries —
 * `+` and `-` — plus the modifier-wheel and pinch gestures the browser itself
 * treats as zoom, and `0` to go back to the room as composed.
 *
 * IT ONLY MEANS ANYTHING IN A ROOM. Standing in front of one painting, zoom
 * leans you in and out of it; in the corridor the camera is on a rail and
 * nothing reads `view`, so pressing + there moved a number and changed
 * nothing on the screen. A control that appears to do nothing is worse than
 * one that is not offered, so outside a gallery these gestures are left to
 * the browser and the hint line does not mention them.
 */
export function attachZoom(active: () => boolean) {
  const onKey = (e: KeyboardEvent) => {
    if (!active()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      nudgeZoom(1.18);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      nudgeZoom(1 / 1.18);
    } else if (e.key === '0') {
      e.preventDefault();
      setZoom(1);
    }
  };

  // ctrl/⌘ + wheel is the browser's own zoom gesture, and what a trackpad
  // pinch reports; taking it over is what the visitor is already asking for
  const onWheel = (e: WheelEvent) => {
    if (!active()) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    nudgeZoom(Math.exp(-e.deltaY * 0.0022));
  };

  // two-finger pinch on touch
  let pinch = 0;
  const spread = (t: TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) pinch = spread(e.touches);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!active() || e.touches.length !== 2 || !pinch) return;
    const now = spread(e.touches);
    nudgeZoom(now / pinch);
    pinch = now;
  };
  const onTouchEnd = () => {
    pinch = 0;
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
  };
}

export function attachPointer() {
  const onMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => window.removeEventListener('pointermove', onMove);
}
