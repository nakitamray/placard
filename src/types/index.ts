export interface ArtworkIndexEntry {
  id: string;
  artist: string;
  title: string;
  aspect: number;
  /** per-painter wall tone — the colour the whole artwork room takes */
  accent: string;
}

/** Thread Pull: a semantic area of the canvas mapped to a readable passage. */
export interface ArtworkRegion {
  id: string;
  label: string;
  /** normalised x0, y0, x1, y1 — image space, y-down */
  box: [number, number, number, number];
  text: string;
}

export interface CorpusSource {
  id: string;
  title: string;
  url: string;
  license: string;
  attribution: string;
}

export interface ArtworkMeta {
  id: string;
  artist: string;
  artistDates: string;
  title: string;
  titleOriginal?: string;
  year: string;
  medium: string;
  dimensions: string;
  housedAt: {
    institution: string;
    city: string;
    room: string;
    accession: string;
    creditLine: string;
  };
  labelText: string;
  extendedNote: string;
  textProvenance: {
    type: 'museum_verbatim' | 'other_museum' | 'placard_original';
    attribution: string;
    url: string;
  };
  image: { file: string; source: string; license: string; photoCredit: string };
  /**
   * Which variants of this painting were actually published, and what each
   * one weighs. Written by scripts/build-images.ts; `src/lib/image.ts` names
   * the same files by convention, so nothing at runtime has to read this —
   * it is here so a build can be audited without listing the directory.
   */
  images?: {
    formats: string[];
    sizes: Array<{ name: string; long: number }>;
    bytes: Record<string, number>;
  };
  accentColor?: string;
  regions: ArtworkRegion[];
  corpus: {
    length: number;
    segments: Array<{ sourceId: string; offset: number; length: number }>;
    sources: CorpusSource[];
  };
  imageWidth: number;
  imageHeight: number;
}

/* ─── museums ─────────────────────────────────────────────────────────────
   Every corridor in the exhibition is the same procedural machine driven by
   a different style record, so adding a museum is a data change, not a
   rendering change. The five shipped styles are modelled on the real rooms
   (see data/museums/*.json for the reference each one follows).            */

/** Vault / roof over the corridor — the single most identifying feature. */
export type CeilingKind =
  /** Louvre: white barrel vault pierced by arched skylights */
  | 'barrel-skylight'
  /** National Gallery Room 32: pitched glass lantern on gilded arches */
  | 'pitched-glass'
  /** Vatican Gallery of Maps: frescoed vault in heavy gilded stucco */
  | 'fresco-vault'
  /** Orsay: colossal arched steel-and-glass train-shed roof */
  | 'steel-glass-arch'
  /** Met sculpture court: peaked triangular skylight over an indoor courtyard */
  | 'peaked-court';

export type FloorKind =
  /** pale reflective stone */
  | 'stone'
  /** polished light wood boards */
  | 'parquet'
  /** geometric marble inlay in white, red and green */
  | 'marble-inlay'
  /** wide pale promenade with a darker central runner */
  | 'promenade'
  /** smooth outdoor-courtyard paving slabs */
  | 'court-paving';

export type WallKind =
  /** densely stacked salon hang on deep blue-grey */
  | 'salon'
  /** single line of large works on crimson */
  | 'crimson-enfilade'
  /** frescoed map panels between pilasters */
  | 'fresco-maps'
  /** carved light stone with recessed bays */
  | 'carved-stone'
  /** asymmetric court: pale stone one side, red brick and white arches the other */
  | 'court-facade';

export type FrameKind =
  /** deep gilt salon frame, corner cartouches, bead course */
  | 'louvre-salon'
  /** heavy swept gilt with fluted cove */
  | 'gallery-swept'
  /** architectural tabernacle: pilasters and pediment */
  | 'vatican-tabernacle'
  /** slim reeded gilt, the impressionist standard */
  | 'orsay-reeded'
  /** broad flat-topped American gilt */
  | 'met-broad';

export interface MuseumStyle {
  ceiling: CeilingKind;
  floor: FloorKind;
  wall: WallKind;
  frame: FrameKind;
  /** how the works are distributed on the wall */
  hang: 'salon' | 'single' | 'alternating';
  /** half the corridor width, metres */
  halfWidth: number;
  /** wall height to the cornice, metres */
  wallHeight: number;
  /** apex of the vault, metres */
  vaultHeight: number;
  bays: number;
  bayDepth: number;
  palette: {
    wall: string;
    wallDeep: string;
    molding: string;
    gilt: string;
    ceiling: string;
    ceilingAccent: string;
    floor: string;
    floorInlay: string;
    accent: string;
    sky: string;
  };
  light: {
    /** sun / skylight colour and strength */
    key: string;
    keyIntensity: number;
    /** direction the key light comes from */
    keyFrom: [number, number, number];
    sky: string;
    ground: string;
    ambient: number;
    lamp: string;
    lampIntensity: number;
    exposure: number;
    background: string;
    fog: [string, number, number];
  };
  fixtures: {
    sculpture: 'pedestal-figures' | 'busts' | 'court-figures' | 'none';
    seating: 'bench' | 'ottoman' | 'none';
    chandeliers: boolean;
    placards: boolean;
    /** Orsay's great clock on the end wall */
    clock: boolean;
    /** Orsay's raised side terraces with glass railings */
    terraces: boolean;
    /** the corridor ends in a floor-to-ceiling window rather than a solid wall */
    glazedEnd?: boolean;
  };
}

export interface MuseumRoom {
  id: string;
  name: string;
  svgPath: string;
  centroid: [number, number];
  active: boolean;
  artworkIndex: number;
}

export interface MuseumPlan {
  viewBox: string;
  level: string;
  rooms: MuseumRoom[];
}

/** What the runtime loads when a museum is chosen. */
export interface MuseumData {
  id: string;
  name: string;
  city: string;
  subtitle: string;
  blurb: string;
  corridorNote: string;
  style: MuseumStyle;
  plan: MuseumPlan;
  artworks: ArtworkIndexEntry[];
}

export interface MuseumIndexEntry {
  id: string;
  name: string;
  city: string;
  subtitle: string;
  count: number;
}

export type Phase = 'boot' | 'landing' | 'corridor' | 'map' | 'warp' | 'gallery';

export interface DeviceTier {
  name: 'high' | 'mid' | 'low';
  glyphSuffix: '' | '-lo';
  rtSize: number;
  dprCap: number;
}
