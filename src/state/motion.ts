/**
 * Transient motion state, mutated per-frame and deliberately kept OUT of
 * React/Zustand so scroll and parallax never cause re-renders.
 */
export const pointer = { x: 0, y: 0 }; // normalised -1..1, raw target
export const corridor = {
  t: 0, // damped scroll progress 0..1
  target: 0,
  mouth: 4, // T1 dolly offset: 4 (landing) → 0 (corridor)
};
export const warp = { p: 0 }; // T3 progress 0..1
export const gallery = {
  x: 0, // damped rail position (world units)
  target: 0,
};

export function resetCorridor(t = 0) {
  corridor.t = t;
  corridor.target = t;
}

// debug/testing handle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__motion = { pointer, corridor, warp, gallery };
}

export function attachPointer() {
  const onMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => window.removeEventListener('pointermove', onMove);
}
