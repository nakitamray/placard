/**
 * Opening a wing.
 *
 * Choosing a museum is the second long wait on this site, and it used to be
 * an unmarked one: the entrance pushed through to a corridor that was still
 * fetching its ten paintings, building its vault and compiling its lights,
 * so the first second or two inside was a room assembling itself in front of
 * you, in stutters.
 *
 * This is the same honesty the entrance curtain has (see state/boot), for one
 * museum: three real pieces of work report in, a screen in the exhibition's
 * own material covers them, and the door opens on a room that is already
 * drawing. See ui/MuseumLoader for what is on screen meanwhile.
 */
import { create } from 'zustand';
import type { MuseumIndexEntry } from '../types';

export const OPENING_STEPS = [
  { key: 'plan', label: 'Unlocking the doors' },
  { key: 'walls', label: 'Hanging the paintings' },
  { key: 'light', label: 'Lighting the rooms' },
] as const;

export type OpeningKey = (typeof OPENING_STEPS)[number]['key'];

interface OpeningState {
  /** the wing being opened, or null when no screen is up */
  museum: MuseumIndexEntry | null;
  /**
   * The museum's own words, once its manifest is in: who hangs there and
   * what they painted. The screen is made of these.
   */
  words: string | null;
  done: OpeningKey[];
  /** the wall has finished writing itself over the entrance and covers it */
  written: boolean;
  /** opening onto the room it was covering */
  closing: boolean;
  start: (m: MuseumIndexEntry) => void;
  setWords: (w: string) => void;
  mark: (k: OpeningKey) => void;
  write: () => void;
  close: () => void;
  clear: () => void;
}

export const useOpening = create<OpeningState>((set) => ({
  museum: null,
  words: null,
  done: [],
  written: false,
  closing: false,
  start: (museum) => set({ museum, words: null, done: [], written: false, closing: false }),
  setWords: (words) => set({ words }),
  mark: (k) => set((s) => (s.done.includes(k) ? s : { done: [...s.done, k] })),
  write: () => set((s) => (s.written ? s : { written: true })),
  close: () => set((s) => (s.museum ? { closing: true } : s)),
  clear: () => set({ museum: null, words: null, done: [], written: false, closing: false }),
}));

/** report a step from outside React — the loaders are not components */
export const markOpening = (k: OpeningKey) => useOpening.getState().mark(k);

/** whether a wing is being opened right now, for things that should wait */
export const openingActive = () => {
  const s = useOpening.getState();
  return !!s.museum && !s.closing;
};

/**
 * Resolves once the wall covers the screen.
 *
 * The room must not be swapped in underneath a wall that is still being
 * written — on a second visit everything is cached and would be ready before
 * the text had reached the bottom of the screen, showing the corridor through
 * the unwritten rows.
 */
export function whenWritten(): Promise<void> {
  return new Promise((resolve) => {
    const s = useOpening.getState();
    if (s.written || !s.museum) return resolve();
    const off = useOpening.subscribe((n) => {
      if (n.written || !n.museum) {
        off();
        resolve();
      }
    });
  });
}
