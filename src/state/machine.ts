/**
 * Application state machine
 *
 * BOOT → LANDING →(T1 portal)→ CORRIDOR →(T2)→ MAP →(T3 warp)→ GALLERY
 * ARTWORK is a sub-state of GALLERY (the camera does not move), so it is
 * modelled as `revealed: boolean` on the gallery phase rather than a phase
 * of its own. MAP ⇄ CORRIDOR and GALLERY → MAP go backwards on Esc.
 *
 * Implementation: plain discriminated data in Zustand. No XState needed.
 */
import type { Phase } from '../types';

const ALLOWED: Record<Phase, Phase[]> = {
  boot: ['landing'],
  landing: ['corridor'],
  // a painting in the corridor can be opened directly — you should not
  // have to walk to the far wall and use the plan to reach a canvas you can
  // already see
  corridor: ['map', 'landing', 'warp'],
  map: ['corridor', 'warp'],
  warp: ['gallery'],
  gallery: ['map'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
