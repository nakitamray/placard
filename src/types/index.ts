/**
 * How a work is framed, where a rectangle is the wrong answer.
 *
 * A tondo hung in a rectangular frame is not the same object; a diptych hung
 * as one picture loses the hinge the whole composition is built across; and an
 * altarpiece painted for a round-headed panel has its composition built for
 * that arch. Set per artwork in the collection record; everything else takes
 * the museum's own frame.
 */
export type FrameShape = 'round' | 'divided';

export interface ArtworkIndexEntry {
  id: string;
  artist: string;
  title: string;
  aspect: number;
  /** per-painter wall tone — the colour the whole artwork room takes */
  accent: string;
  shape?: FrameShape;
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
  /**
   * One way out of the exhibition, for a work that cannot be shown whole.
   *
   * A handscroll is twelve metres of painting hung here as one scene of it,
   * and no wall label can make up for that. The honest thing is to say which
   * scene it is and point at the rest, which is what this is: a label and a
   * URL, shown under the wall text, and only on the works that need one.
   */
  link?: { label: string; url: string };
  textProvenance: {
    type: 'museum_verbatim' | 'other_museum' | 'placard_original';
    attribution: string;
    url: string;
  };
  image: {
    file: string;
    /** where the reproduction came from, in words */
    source: string;
    /** the Commons file it was fetched from, if it was */
    commonsFile: string;
    /** that file's page on Commons */
    url: string;
    license: string;
    photoCredit: string;
    /** anything done to the scan after fetching it, e.g. a crop */
    note: string;
  };
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
  | 'peaked-court'
  /** Uffizi: a flat ceiling of dark crossbeams with grotesque frescoes between */
  | 'grotesque-beams'
  /** British Museum: a deep grid of stepped coffers between heavy square beams */
  | 'deep-coffers';

export type FloorKind =
  /** pale reflective stone */
  | 'stone'
  /** polished light wood boards */
  | 'parquet'
  /** oak parquet in two tones, laid as large squares with the grain crossed */
  | 'parquet-check'
  /** geometric marble inlay in white, red and green */
  | 'marble-inlay'
  /** wide pale promenade with a darker central runner */
  | 'promenade'
  /** smooth outdoor-courtyard paving slabs */
  | 'court-paving'
  /** polished marble laid as a diagonal checkerboard, charcoal and pale grey */
  | 'checkerboard'
  /** British Museum: wide bands of matte stone across the hall, grey and charcoal */
  | 'stone-bands';

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
  | 'court-facade'
  /** Uffizi: plaster and a portrait frieze one side, tall windows the other */
  | 'uffizi-corridor'
  /** British Museum: a free-standing colonnade off the wall, tall windows high on one side */
  | 'stone-colonnade';

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
  | 'met-broad'
  /** Florentine cassetta: a flat gilt bed between two carved courses */
  | 'uffizi-gilt'
  /** dark stained hardwood with a thin gilt sight edge — the museum standard */
  | 'museum-plain';

export interface MuseumStyle {
  ceiling: CeilingKind;
  floor: FloorKind;
  wall: WallKind;
  frame: FrameKind;
  /** how the works are distributed on the wall */
  /**
   * salon       a large work with two smaller ones stacked above it, both walls
   * single      one work per bay, both walls
   * alternating one work per bay, sides alternating
   * one-wall    one work per bay, all of them on the left
   *
   * one-wall is for a corridor whose other side is not a wall — the Uffizi,
   * where the whole right-hand side is glazed. It also has the property that
   * ten bays hang ten works exactly once: the two-sided patterns fill twenty
   * slots from ten records and hang everything twice.
   */
  hang: 'salon' | 'single' | 'alternating' | 'one-wall';
  /** half the corridor width, metres */
  halfWidth: number;
  /** wall height to the cornice, metres */
  wallHeight: number;
  /** apex of the vault, metres */
  vaultHeight: number;
  bays: number;
  bayDepth: number;
  /**
   * The height every painting in this corridor is centred on, in metres.
   * Omitted, it is a bit under head height — see `dimsFor`.
   */
  hangHeight?: number;
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
    /**
     * bench         a single waxed dark oak bench on the centre line
     * stone-benches two rows of pale stone benches with cushioned tops, one
     *               either side of the centre line — the Orsay's nave, and the
     *               thing that most tells it apart from the Louvre's corridor
     * marble-benches carved marble with scrolled ends, down the centre line of
     *               a hall of columns
     * ottoman       a round tufted leather sofa in the middle of the room
     */
    seating: 'bench' | 'stone-benches' | 'marble-benches' | 'ottoman' | 'none';
    chandeliers: boolean;
    placards: boolean;
    /** Orsay's great clock on the end wall */
    clock: boolean;
    /** Orsay's raised side terraces with glass railings */
    terraces: boolean;
    /** the corridor ends in a floor-to-ceiling window rather than a solid wall */
    glazedEnd?: boolean;
    /** brass stanchions and red rope down both sides, in front of the plinths */
    ropes?: boolean;
    /** waist-high stone platforms with glass cases on them, stripped of contents */
    vitrines?: boolean;
    /** a lighting track down the centre line, with directional spots on it */
    spotTrack?: boolean;
    /**
     * The room is lit for evening.
     *
     * One flag rather than three because the three are one decision: a glazed
     * roof shows sky instead of daylight, the pools it throws on the floor
     * fall away to almost nothing, and the pictures are lit by their own
     * lamps. Setting any one of them without the others gives a room that
     * reads as broken rather than as dusk.
     */
    dusk?: boolean;
    /**
     * The room is lit by its windows rather than by its lamps.
     *
     * Warm light is placed just inside the glazed wall and thrown across the
     * corridor at the hang, instead of the row of point lights down the
     * centre line that an artificially lit gallery gets.
     */
    daylight?: boolean;
    /**
     * A continuous warm source hidden along the top of both walls, throwing
     * light up into the ceiling. The Gallery of Maps is lit this way and it
     * is the whole reason that vault glows.
     */
    cove?: boolean;
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
  homepage: string;
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
  homepage: string;
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
