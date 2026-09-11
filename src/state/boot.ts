/**
 * What the door is waiting for.
 *
 * The exhibition used to open the moment the museum list arrived — which is
 * long before anything is ready to be drawn. The bundle still had to be
 * parsed, the first painting's glyph binary still had to be fetched, and,
 * most expensively of all, the shaders still had to be compiled: a custom GPU
 * program cannot be built until something first tries to draw with it, and
 * that compile stalls the whole page for as long as it takes.
 *
 * So the stall was happening in plain sight, one frame after a loading bar had
 * filled to the end and promised the visitor it was finished. A stutter after
 * a completed progress bar does not read as loading. It reads as broken.
 *
 * This is the honest version. Three real pieces of work report in here, the
 * rule across the bottom of the screen measures how many have landed, and the
 * door opens when the first frame has actually been drawn — with the compile
 * spent behind the curtain where it belongs, rather than in the first second
 * of the exhibition.
 *
 * WHAT IS ON SCREEN WHILE IT WAITS
 *   A wall of the exhibition's own text, stepping and breathing exactly as the
 *   paintings do, lighting from dim bone to gilt in reading order as these
 *   steps report in — see ui/LoadingBar.tsx. The progress is the text being
 *   lit rather than a bar with a caption under it, which is the only kind of
 *   loading screen this site could honestly have.
 */
import { create } from 'zustand';

/** the three things worth waiting for, in the order they land */
export const BOOT_STEPS = [
  { key: 'catalogue', label: 'The catalogue' },
  { key: 'canvas', label: 'The first canvas' },
  { key: 'light', label: 'The light' },
] as const;

export type BootKey = (typeof BOOT_STEPS)[number]['key'];

interface BootState {
  /** which steps have reported in */
  done: BootKey[];
  /**
   * The curtain has finished saying what it had to say.
   *
   * The work being done and the screen covering it finish at different
   * moments. The three steps can all land while the wall of text is still
   * lighting — and a curtain pulled at that instant leaves half a wall bone
   * and half of it gilt, which does not read as an exhibition opening. It
   * reads as an animation that was interrupted. So the wall reports in too,
   * and the door waits the second or so it costs to complete the sentence.
   */
  filled: boolean;
  /** the first frame has been drawn: the room behind the curtain is real */
  ready: boolean;
  mark: (key: BootKey) => void;
  fill: () => void;
  open: () => void;
}

export const useBoot = create<BootState>((set) => ({
  done: [],
  filled: false,
  ready: false,
  mark: (key) =>
    set((s) => (s.done.includes(key) ? s : { done: [...s.done, key] })),
  fill: () => set({ filled: true }),
  open: () => set({ ready: true }),
}));

/** 0..1, for the rule across the bottom of the screen */
export function bootProgress(done: BootKey[]): number {
  return done.length / BOOT_STEPS.length;
}

/** the step being waited on, or null once they have all landed */
export function bootWaitingFor(done: BootKey[]) {
  return BOOT_STEPS.find((s) => !done.includes(s.key)) ?? null;
}

/**
 * Report a step from outside React.
 *
 * The loaders and the pre-pass are not components and have no business
 * holding a hook to say they have finished.
 */
export const markBoot = (key: BootKey) => useBoot.getState().mark(key);

/** the wall of text has lit all the way to its last character */
export const markBootFilled = () => useBoot.getState().fill();
