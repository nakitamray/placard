/**
 * Artwork reveal choreography — spec §10.6.
 *
 * Focus is created by ADDING light to the artwork, not by removing light
 * from the room: environment settles to 0.78, never a blackout.
 *
 * Tweened values live in a mutable object read inside useFrame, so the
 * animation never causes React re-renders.
 */
import gsap from 'gsap';
import { useStore } from '../state/store';

export const revealAnim = {
  /** 0 = full text, 1 = fully dissolved (uDissolve + paint crossfade) */
  dissolve: 0,
  /** artwork spotlight intensity */
  spot: 12,
  /** environment settle multiplier */
  env: 1.0,
  /**
   * Whether this reveal was asked for, or merely stumbled into.
   *
   * Hovering a canvas reveals the painting, and that has to stay reversible —
   * the text field *is* the exhibition, and a visitor who brushes past a work
   * should get it back by moving away. But reading the wall label means
   * moving the cursor off the canvas, which is the same gesture. So the two
   * are separated: hover reveals loosely, and clicking the canvas, pressing
   * Enter, or reaching the label itself latches the reveal open until it is
   * closed deliberately.
   */
  latched: false,
};

let tl: gsap.core.Timeline | null = null;
let release = 0;

/** cancel a pending close — the visitor came back, or reached the label */
export function holdReveal() {
  window.clearTimeout(release);
  release = 0;
}

/** the reveal is now deliberate: leaving the canvas will not close it */
export function latchReveal() {
  holdReveal();
  revealAnim.latched = true;
  // the label is what latching is FOR, so the store has to hear about it
  if (useStore.getState().revealed) useStore.getState().setRevealed(true, true);
}

/**
 * Leaving the canvas. A latched reveal ignores it; an unlatched one closes,
 * but not instantly — half a second is enough for a cursor to cross the gap
 * between the painting and its label without the label vanishing on the way.
 */
export function releaseReveal(reducedMotion: boolean) {
  if (revealAnim.latched || release) return;
  release = window.setTimeout(() => {
    release = 0;
    if (!revealAnim.latched) endReveal(reducedMotion);
  }, 500);
}

export function startReveal(reducedMotion: boolean, latched = false) {
  tl?.kill();
  holdReveal();
  revealAnim.latched = latched;
  useStore.getState().setRevealed(true, latched);
  if (reducedMotion) {
    revealAnim.dissolve = 1;
    revealAnim.spot = 26;
    revealAnim.env = 0.78;
    useStore.getState().setDissolve(1);
    return;
  }
  tl = gsap.timeline();
  tl.to(revealAnim, {
    dissolve: 1,
    duration: 0.9,
    ease: 'power2.inOut',
    onUpdate: () => useStore.getState().setDissolve(revealAnim.dissolve),
  });
  tl.to(revealAnim, { spot: 26, duration: 0.7, ease: 'power2.out' }, 0.2);
  tl.to(revealAnim, { env: 0.78, duration: 0.7, ease: 'power2.out' }, 0.2);
}

export function endReveal(reducedMotion: boolean) {
  tl?.kill();
  holdReveal();
  revealAnim.latched = false;
  useStore.getState().setRevealed(false);
  if (reducedMotion) {
    revealAnim.dissolve = 0;
    revealAnim.spot = 12;
    revealAnim.env = 1.0;
    useStore.getState().setDissolve(0);
    return;
  }
  tl = gsap.timeline();
  tl.to(revealAnim, {
    dissolve: 0,
    spot: 12,
    env: 1.0,
    duration: 0.6,
    ease: 'power2.in',
    onUpdate: () => useStore.getState().setDissolve(revealAnim.dissolve),
  });
}
