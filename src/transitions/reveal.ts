/**
 * Artwork reveal choreography.
 *
 * A painting in a gallery is made of its own words. The reproduction under
 * them is reached in exactly one way — a deliberate click, or Enter — and it
 * is put back the moment that decision is undone. There is no other route in.
 *
 * Focus is created by ADDING light to the artwork, not by removing light from
 * the room: environment settles to 0.78, never a blackout.
 *
 * Tweened values live in a mutable object read inside useFrame, so the
 * animation never causes React re-renders. That is also the one hazard here:
 * the shader reads `revealAnim`, the interface reads the store, and anything
 * that changes one without the other leaves a work standing fully dissolved
 * with nothing open. The subscription at the foot of this file is what makes
 * that impossible — see it before adding another way to clear a reveal.
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
   * Whether this reveal was asked for.
   *
   * It always is, now. Hovering a canvas opens the reading lens and nothing
   * else (see transitions/lens.ts); the full dissolve is only ever reached by
   * clicking the canvas or pressing Enter, so it stays open until it is
   * closed deliberately. The flag is kept because the wall label is keyed to
   * it, and because the landing hero still reveals without a click.
   */
  latched: false,
};

let tl: gsap.core.Timeline | null = null;

/** the reveal is deliberate: leaving the canvas will not close it */
export function latchReveal() {
  revealAnim.latched = true;
  // the label is what latching is FOR, so the store has to hear about it
  if (useStore.getState().revealed) useStore.getState().setRevealed(true, true);
}

export function startReveal(reducedMotion: boolean, latched = false) {
  tl?.kill();
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

/**
 * Back to words, with no animation and no questions.
 *
 * Used when the reveal is not on screen to be animated away — leaving the
 * gallery, changing works — where a tween would only be a tween nobody sees
 * that can still be interrupted half-finished.
 */
function rest() {
  tl?.kill();
  tl = null;
  revealAnim.dissolve = 0;
  revealAnim.spot = 12;
  revealAnim.env = 1.0;
  revealAnim.latched = false;
}

export function endReveal(reducedMotion: boolean) {
  tl?.kill();
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

/*
 * The words are the default, and this is what guarantees it.
 *
 * `revealAnim.dissolve` is what the shader samples; `revealed` is what the
 * interface reads. Every deliberate route through this file moves both, but
 * the store also clears `revealed` on its own — changing phase, changing the
 * work on the rail, a screen-reader proxy taking focus — and those routes
 * cannot be expected to know about a mutable object in a transitions module.
 *
 * So the animation follows the store rather than trusting its callers: any
 * moment the store says no work is open, the glyphs come back. Walk out of a
 * gallery with a painting open and walk in again and it is made of text, as
 * it should be.
 */
if (typeof window !== 'undefined') {
  useStore.subscribe(
    (s) => (s.phase === 'gallery' && s.revealed ? 'open' : s.phase === 'gallery' ? 'closed' : 'away'),
    (state) => {
      if (state === 'open') return;
      if (state === 'away') return rest();
      if (revealAnim.dissolve !== 0 || revealAnim.latched) {
        endReveal(useStore.getState().reducedMotion);
      }
    },
  );
}
