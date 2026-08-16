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
};

let tl: gsap.core.Timeline | null = null;

export function startReveal(reducedMotion: boolean) {
  tl?.kill();
  useStore.getState().setRevealed(true);
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
