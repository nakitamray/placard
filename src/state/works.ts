/**
 * Every work in the exhibition, flat.
 *
 * The museums are loaded one at a time — entering the Louvre never costs the
 * download of the other four — but the entrance draws from all fifty, so it
 * needs a list that crosses them. `scripts/build-all.ts` writes it: id,
 * museum, artist, title, proportions, and where to hold the picture when it
 * has to be cropped to fill a window.
 *
 * It names pictures that are already published per artwork, so it costs one
 * small request and no image bytes of its own.
 */
import { asset } from '../lib/asset';

export interface ExhibitionWork {
  id: string;
  museum: string;
  artist: string;
  title: string;
  /** width / height of the published reproduction */
  aspect: number;
  /** normalised image coordinates, y down — see scripts/build-all.ts */
  focus: [number, number];
}

let pending: Promise<ExhibitionWork[]> | null = null;

/** Fetched once and shared; an empty list if the assets have not been built. */
export function exhibitionWorks(): Promise<ExhibitionWork[]> {
  if (pending) return pending;
  pending = fetch(asset('museums/works.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`works.json: ${r.status}`);
      return r.json() as Promise<ExhibitionWork[]>;
    })
    .catch(() => []);
  return pending;
}

/** Fisher–Yates on a copy, so every order is equally likely. */
export function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
