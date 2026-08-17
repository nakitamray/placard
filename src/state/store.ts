import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { canTransition } from './machine';
import { resetCorridor } from './motion';
import type {
  ArtworkIndexEntry,
  ArtworkRegion,
  MuseumData,
  MuseumIndexEntry,
  Phase,
} from '../types';

interface AppStore {
  phase: Phase;
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
  hoveredRegion: ArtworkRegion | null;
  pulledRegion: ArtworkRegion | null;

  /** the corridor canvas under the cursor, for the floating label */
  hoveredWork: { index: number; artist: string; title: string } | null;

  /** every museum in the exhibition, for the landing page */
  museums: MuseumIndexEntry[];
  /** the one currently entered — carries its corridor style, plan and works */
  museum: MuseumData | null;
  museumLoading: string | null;

  setPhase: (p: Phase) => void;
  setCorridorT: (t: number) => void;
  setIndex: (i: number) => void;
  setRevealed: (r: boolean) => void;
  setDissolve: (d: number) => void;
  setPlacardExpanded: (e: boolean) => void;
  setCreditsOpen: (o: boolean) => void;
  setHoveredWork: (w: { index: number; artist: string; title: string } | null) => void;
  setMuseums: (m: MuseumIndexEntry[]) => void;
  setMuseum: (m: MuseumData | null) => void;
  setMuseumLoading: (id: string | null) => void;
  setExtractionMode: (e: boolean) => void;
  setHoveredRegion: (r: ArtworkRegion | null) => void;
  setPulledRegion: (r: ArtworkRegion | null) => void;
}

/** the works of the museum currently entered — empty before one is chosen */
export const selectArtworks = (s: AppStore): ArtworkIndexEntry[] => s.museum?.artworks ?? [];

export const useStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'boot',
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

    hoveredWork: null,
    museums: [],
    museum: null,
    museumLoading: null,

    setPhase: (p) => {
      const from = get().phase;
      if (from === p) return;
      if (!canTransition(from, p)) return;
      // there is nothing to walk through until a museum has been chosen
      if (p === 'corridor' && !get().museum) return;
      if (p === 'corridor' && from === 'landing') {
        sessionStorage.setItem('placard.seenIntro', '1');
      }
      set({
        phase: p,
        ...(p !== 'corridor' ? { hoveredWork: null } : {}),
        ...(p === 'corridor' && from === 'map' ? { corridorT: 0.8 } : {}),
        ...(p === 'landing' ? { corridorT: 0, museum: null, index: 0 } : {}),
        ...(p !== 'gallery' ? { revealed: false, dissolve: 0, placardExpanded: false } : {}),
      });
    },
    setCorridorT: (t) => set({ corridorT: Math.max(0, Math.min(1, t)) }),
    setIndex: (i) => {
      const n = selectArtworks(get()).length;
      set({ index: Math.max(0, Math.min(n - 1, i)), revealed: false, placardExpanded: false });
    },
    setRevealed: (r) => set({ revealed: r, ...(r ? {} : { placardExpanded: false }) }),
    setDissolve: (d) => set({ dissolve: d }),
    setPlacardExpanded: (e) => set({ placardExpanded: e }),
    setCreditsOpen: (o) => set({ creditsOpen: o }),
    setHoveredWork: (hoveredWork) => set({ hoveredWork }),
    setMuseums: (museums) => set({ museums }),
    setMuseum: (museum) => {
      // Entering a museum always starts you at the mouth of its corridor.
      // Corridor progress lives outside React (it is mutated per frame), so
      // without this the second museum you visit drops you wherever you left
      // the first one — usually at the far wall, which fires the transition to
      // the floor plan before you have seen the room.
      resetCorridor(0);
      set({ museum, index: 0 });
    },
    setMuseumLoading: (museumLoading) => set({ museumLoading }),
    setExtractionMode: (e) =>
      set(e ? { extractionMode: true } : { extractionMode: false, hoveredRegion: null }),
    setHoveredRegion: (r) => set({ hoveredRegion: r }),
    setPulledRegion: (r) => set({ pulledRegion: r }),
  })),
);

/** Fetch a museum's manifest and enter it. Cached, so re-entry is instant. */
const museumCache = new Map<string, Promise<MuseumData>>();

export function loadMuseum(id: string): Promise<MuseumData> {
  const hit = museumCache.get(id);
  if (hit) return hit;
  const p = fetch(`/museums/${id}.json`).then((r) => {
    if (!r.ok) throw new Error(`museum ${id}: ${r.status}`);
    return r.json() as Promise<MuseumData>;
  });
  museumCache.set(id, p);
  return p;
}

// debug/testing handle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__placard = useStore;
}
