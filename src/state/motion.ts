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

/*
 * The same three moves, as functions rather than as keystrokes.
 *
 * `+`, `-` and `0` are the whole zoom on a desk, and on a phone they are three
 * keys nobody has. The on-screen controls (see ui/ZoomControls) call these, so
 * the pinch, the keys and the buttons are one mechanism with three faces
 * rather than three implementations that drift apart.
 */
export function zoomIn() {
  nudgeZoom(1.3);
}
export function zoomOut() {
  nudgeZoom(1 / 1.3);
}
/** how far in the visitor currently is, for a control that wants to grey out */
export function zoomAtMax(): boolean {
  return view.goal >= ZOOM_MAX - 0.001;
}
export function zoomAtMin(): boolean {
  return view.goal <= ZOOM_MIN + 0.001;
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

  /*
   * Two-finger pinch on touch.
   *
   * `touchend` fires per finger, so lifting one of a pinch used to leave the
   * gesture armed with a stale spread — and the next single-finger drag along
   * the rail arrived as a pinch of some enormous ratio, which snapped the zoom
   * to a limit for no reason the visitor could see. The gesture is now rearmed
   * whenever the number of fingers changes and dropped the moment there are
   * fewer than two.
   */
  let pinch = 0;
  const spread = (t: TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: TouchEvent) => {
    pinch = e.touches.length === 2 ? spread(e.touches) : 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2) {
      pinch = 0;
      return;
    }
    if (!active()) return;
    const now = spread(e.touches);
    // the first move of a pinch that began before the gesture was armed
    if (!pinch) {
      pinch = now;
      return;
    }
    nudgeZoom(now / pinch);
    pinch = now;
  };
  const onTouchEnd = (e: TouchEvent) => {
    pinch = e.touches.length === 2 ? spread(e.touches) : 0;
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

/**
 * How far the finger currently on the glass has travelled.
 *
 * WHY THIS HAS TO EXIST. Both rooms are driven by swipes — up the screen walks
 * the corridor, across it moves along the rail — and both also answer a tap on
 * a painting by opening it. On a desk those are different gestures with
 * different buttons; on a touch screen they are the same finger, and the only
 * thing separating them is how far it moved.
 *
 * The browser normally makes that distinction itself and withholds the `click`
 * after a drag. But the canvas is `touch-action: none` — it has to be, or every
 * pinch is the page zooming instead of the painting — and how much slop an
 * engine allows before it stops calling a touch a tap is neither specified nor
 * consistent once the default action is gone. Chrome and Safari disagree, and
 * both of them are wrong for a swipe of exactly the length somebody uses to
 * step down a corridor.
 *
 * So the distance is measured here, once, and the two places that open a
 * painting ask before they do it. `total` is deliberately NOT cleared on
 * `touchend`: the `click` arrives after the finger has left, and a counter
 * zeroed a moment too early would let every swipe through as a tap — which is
 * the bug this exists to prevent.
 */
export const touchSlip = { total: 0 };

/** far enough that the visitor was moving the room, not choosing something */
export function wasSwipe(): boolean {
  return touchSlip.total > 12;
}

/**
 * Whether moving the pointer should also turn the visitor's head.
 *
 * On a desk the parallax is the whole feeling of standing in a room: the walls
 * of the corridor swing gently as you look along them, and the painting leans a
 * degree or two as the cursor crosses it. It is driven by where the cursor is,
 * and on a desk the cursor is where the visitor is looking.
 *
 * On a touch screen there is no cursor. `pointer` there records where a finger
 * last landed — which is very often a control in a corner — so the room lurched
 * two degrees toward the bottom-left of the screen a second after the visitor
 * pressed the sound switch, and stayed there. In a gallery that is now framed
 * to the edges of a narrow window, two degrees of yaw is enough to push the
 * painting off the side: tapping "threads" moved the Mona Lisa half out of
 * frame. The gesture does not exist on the device, so neither should its
 * effect.
 *
 * `pointer` itself keeps being updated — the zoom still leans toward the last
 * place a finger touched, which on a touch screen is exactly right — this only
 * governs the head-turn.
 */
export function pointerLook(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !matchMedia('(pointer: coarse)').matches || matchMedia('(any-hover: hover)').matches;
}

export function attachPointer() {
  const onMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  let last: { x: number; y: number } | null = null;
  const onTouchStart = (e: TouchEvent) => {
    touchSlip.total = 0;
    const t = e.touches[0];
    last = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    if (last) touchSlip.total += Math.hypot(t.clientX - last.x, t.clientY - last.y);
    last = { x: t.clientX, y: t.clientY };
    // a second finger is a pinch, which is never a tap on anything
    if (e.touches.length > 1) touchSlip.total = 999;
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
  };
}
