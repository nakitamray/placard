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
 *   The wall text of the painting that is about to appear. This exhibition's
 *   whole claim is that these pictures are made out of the writing about them,
 *   so the wait is not dead time to be dressed up with a spinner — it is the
 *   first thing anybody reads, and what they read is the text the first
 *   painting is built from. By the time the words have gone, the picture they
 *   describe is standing behind them.
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
  /** the wall text of the work about to appear, once it is known */
  line: string | null;
  /** and whose it is */
  credit: string | null;
  /** the first frame has been drawn: the room behind the curtain is real */
  ready: boolean;
  mark: (key: BootKey) => void;
  setLine: (line: string, credit: string) => void;
  open: () => void;
}

export const useBoot = create<BootState>((set) => ({
  done: [],
  line: null,
  credit: null,
  ready: false,
  mark: (key) =>
    set((s) => (s.done.includes(key) ? s : { done: [...s.done, key] })),
  setLine: (line, credit) => set({ line, credit }),
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
