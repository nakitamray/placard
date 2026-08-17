import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { canTransition } from './machine';
import type { ArtworkIndexEntry, ArtworkRegion, GalleryData, Phase } from '../types';

interface AppStore {
  phase: Phase;
  galleryId: string | null;
  /** corridor scroll progress 0→1 */
  corridorT: number;
  /** current artwork index on the gallery rail */
  index: number;
  /** artwork sub-state of GALLERY (spec §9 — not a route change) */
  revealed: boolean;
  /** 0 = full text, 1 = fully dissolved (drives uDissolve) */
  dissolve: number;
  placardExpanded: boolean;
  creditsOpen: boolean;
  reducedMotion: boolean;
  seenIntro: boolean;

  /** Thread Pull: Shift held over the canvas puts the cursor in extraction mode */
  extractionMode: boolean;
  /** the region the cursor is over while in extraction mode */
  hoveredRegion: ArtworkRegion | null;
  /** the region currently extracted into the reading panel */
  pulledRegion: ArtworkRegion | null;

  artworks: ArtworkIndexEntry[];
  gallery: GalleryData | null;

  setPhase: (p: Phase) => void;
  setCorridorT: (t: number) => void;
  setIndex: (i: number) => void;
  setRevealed: (r: boolean) => void;
  setDissolve: (d: number) => void;
  setPlacardExpanded: (e: boolean) => void;
  setCreditsOpen: (o: boolean) => void;
  setData: (artworks: ArtworkIndexEntry[], gallery: GalleryData) => void;
  setExtractionMode: (e: boolean) => void;
  setHoveredRegion: (r: ArtworkRegion | null) => void;
  setPulledRegion: (r: ArtworkRegion | null) => void;
}

export const useStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'boot',
    galleryId: null,
    corridorT: 0,
    index: 0,
    revealed: false,
    dissolve: 0,
    placardExpanded: false,
    creditsOpen: false,
    reducedMotion:
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    seenIntro:
      typeof window !== 'undefined' && sessionStorage.getItem('placard.seenIntro') === '1',

    extractionMode: false,
    hoveredRegion: null,
    pulledRegion: null,

    artworks: [],
    gallery: null,

    setPhase: (p) => {
      const from = get().phase;
      if (from === p) return;
      if (!canTransition(from, p)) return;
      if (p === 'corridor' && from === 'landing') {
        sessionStorage.setItem('placard.seenIntro', '1');
      }
      set({
        phase: p,
        ...(p === 'corridor' && from === 'map' ? { corridorT: 0.8 } : {}),
        ...(p === 'landing' ? { corridorT: 0 } : {}),
        ...(p !== 'gallery' ? { revealed: false, dissolve: 0, placardExpanded: false } : {}),
      });
    },
    setCorridorT: (t) => set({ corridorT: Math.max(0, Math.min(1, t)) }),
    setIndex: (i) => {
      const n = get().artworks.length;
      set({ index: Math.max(0, Math.min(n - 1, i)), revealed: false, placardExpanded: false });
    },
    setRevealed: (r) => set({ revealed: r, ...(r ? {} : { placardExpanded: false }) }),
    setDissolve: (d) => set({ dissolve: d }),
    setPlacardExpanded: (e) => set({ placardExpanded: e }),
    setCreditsOpen: (o) => set({ creditsOpen: o }),
    setData: (artworks, gallery) => set({ artworks, gallery, galleryId: gallery.id }),
    setExtractionMode: (e) =>
      set(e ? { extractionMode: true } : { extractionMode: false, hoveredRegion: null }),
    setHoveredRegion: (r) => set({ hoveredRegion: r }),
    setPulledRegion: (r) => set({ pulledRegion: r }),
  })),
);

// debug/testing handle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__placard = useStore;
}
