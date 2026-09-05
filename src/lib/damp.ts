/**
 * Universal damping rule Never bind a layer directly to raw
 * pointer position; always ease toward a target, frame-rate normalised.
 */
export function dampK(base: number, delta: number): number {
  return 1 - Math.pow(1 - base, delta * 60);
}

export function damp(current: number, target: number, base: number, delta: number): number {
  return current + (target - current) * dampK(base, delta);
}
