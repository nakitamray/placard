/**
 * The authoring contract.
 *
 * A museum is one file in data/museums/ (identity, corridor style, floor plan,
 * and the ordered list of works it hangs). Its works are one file in
 * data/collections/ — an array of self-contained records. Everything the
 * pipeline needs is in those two files.
 *
 * data/artworks/{id}/ is optional and exists only to override generated
 * assets for a particular work:
 *
 *   source.jpg     a real public-domain scan, used instead of the generated
 *                  stand-in — this is the one file worth adding
 *   corpus/ +
 *   sources.json   real historical texts to build the glyph corpus from,
 *                  instead of deriving it from the record's own placard text
 *   regions.json   hand-authored Thread Pull regions (a record may also carry
 *                  them inline, which is the usual way)
 *   config.json    per-artwork glyph tuning
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA, artworkData, collectionData, museumData } from './paths.ts';
import type { PlaceholderSpec } from '../build-placeholder.ts';

export interface ArtworkRegionRecord {
  id: string;
  label: string;
  box: [number, number, number, number];
  text: string;
}

export interface ArtworkRecord {
  id: string;
  artist: string;
  artistDates: string;
  title: string;
  titleOriginal?: string;
  year: string;
  medium: string;
  dimensions: string;
  room: string;
  accession: string;
  creditLine: string;
  /** the painter's identifying colour — the whole artwork room takes it */
  accentColor: string;
  /**
   * Where to hold the picture when it is cropped to fill a window, as
   * normalised image coordinates with y down: [0.5, 0.5] is the middle,
   * [0.5, 0.3] keeps a head near the top of a tall canvas in frame.
   *
   * Only the entrance crops a painting — everything inside a museum is hung
   * whole — so this is the one place it matters, and only works whose subject
   * sits well off centre need it. Omitted, a tall work is held a little above
   * centre and everything else in the middle.
   */
  heroFocus?: [number, number];
  /**
   * Keep this work off the entrance.
   *
   * The entrance is the one screen that crops a painting to whatever shape
   * the window happens to be, and some works cannot survive it: a scroll six
   * times wider than it is tall, a hanging banner, a small watercolour whose
   * best available scan is soft at full bleed. They are perfectly good on a
   * wall, where they are hung whole and at their own size, and this is the
   * flag that says so.
   */
  heroSkip?: boolean;
  /**
   * What is actually reproduced, when it is not the catalogued object.
   *
   * Some works cannot be shown as themselves. The Geese of Meidum is in Cairo
   * and what museums outside it hang is a nineteenth-century facsimile; a
   * handscroll is shown as one section of itself; a diptych is photographed as
   * a pair. In every one of those cases the picture on the wall has different
   * proportions from the object in the catalogue, and `pnpm check` is right to
   * say so — once. This is the sentence that answers it: state what the
   * reproduction is, and the proportions check stops asking.
   *
   * IT IS NOT A SILENCER. Anything written here is printed on the colophon
   * beside the image credit, because a visitor looking at a facsimile is owed
   * the same sentence the check was owed.
   */
  reproduction?: string;
  /**
   * A label and a URL shown on the placard, for a work reproduced as a
   * fragment of itself: "The whole scroll, at the British Museum".
   */
  link?: { label: string; url: string };
  /**
   * How this work is framed, where a rectangle is the wrong answer: 'round'
   * for a tondo, 'divided' for a pair of panels hung as one object with a
   * moulded divider between them. Omitted, the museum's own frame is used.
   */
  frameShape?: 'round' | 'divided';
  labelText: string;
  extendedNote: string;
  placeholder: PlaceholderSpec;
  regions?: ArtworkRegionRecord[];
}

export interface MuseumRecord {
  id: string;
  name: string;
  city: string;
  /** the museum's own site, which the corridor title and the colophon link to */
  homepage: string;
  subtitle: string;
  blurb: string;
  corridorNote: string;
  style: unknown;
  plan: unknown;
  artworks: string[];
}

export interface GlyphConfig {
  workingWidth: number;
  minCell: number;
  maxCell: number;
  varianceThreshold: number;
  fontScale: number;
  paletteSize: number;
  saturationBoost: number;
  contrastBoost: number;
  /**
   * Ceiling on the glyphs one work may emit. The visitor pays for every glyph
   * twice — eight bytes down the wire and one instance in the animated draw —
   * so this is the single number that decides what a painting costs. If the
   * quadtree exceeds it, build-glyphs raises the cell floor and runs again.
   */
  maxGlyphs: number;
}

/** Sensible defaults for every artwork; data/artworks/{id}/config.json wins. */
export const DEFAULT_GLYPH_CONFIG: GlyphConfig = {
  workingWidth: 1200,
  minCell: 5,
  maxCell: 16,
  varianceThreshold: 0.005,
  fontScale: 1.1,
  paletteSize: 96,
  saturationBoost: 1.08,
  contrastBoost: 1.05,
  maxGlyphs: 20000,
};

/**
 * The low device tier's variant of the same painting.
 *
 * Both cell bounds double, not just the floor: the quadtree bottoms out on
 * `maxCell` long before it reaches `minCell`, so raising the floor alone
 * changes the output by about two percent — the same 128KB and the same
 * sixteen thousand instances under a different file name. Doubling the ceiling
 * is what actually quarters it.
 */
export const LOW_TIER_GLYPHS = (cfg: GlyphConfig): Partial<GlyphConfig> => ({
  minCell: cfg.minCell * 2,
  maxCell: cfg.maxCell * 2,
  maxGlyphs: Math.round(cfg.maxGlyphs / 4),
});

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;

export function museumOrder(): string[] {
  return readJson<string[]>(path.join(DATA, 'museums', 'order.json'));
}

export function loadMuseum(id: string): MuseumRecord {
  return readJson<MuseumRecord>(museumData(id));
}

export function loadCollection(museumId: string): ArtworkRecord[] {
  return readJson<ArtworkRecord[]>(collectionData(museumId));
}

/** Museum record + its works, joined and validated. */
export function loadMuseumWithWorks(id: string): {
  museum: MuseumRecord;
  works: ArtworkRecord[];
} {
  const museum = loadMuseum(id);
  const collection = loadCollection(id);
  const byId = new Map(collection.map((w) => [w.id, w]));
  const works = museum.artworks.map((workId) => {
    const rec = byId.get(workId);
    if (!rec) {
      throw new Error(
        `${id}: "${workId}" is listed in data/museums/${id}.json but missing from data/collections/${id}.json`,
      );
    }
    return rec;
  });
  return { museum, works };
}

export function glyphConfig(id: string): GlyphConfig {
  const override = path.join(artworkData(id), 'config.json');
  if (!fs.existsSync(override)) return DEFAULT_GLYPH_CONFIG;
  return { ...DEFAULT_GLYPH_CONFIG, ...readJson<Partial<GlyphConfig>>(override) };
}

/** Hand-authored regions on disk win over the ones inline in the record. */
export function regionsFor(record: ArtworkRecord): ArtworkRegionRecord[] {
  const override = path.join(artworkData(record.id), 'regions.json');
  if (fs.existsSync(override)) {
    return readJson<{ regions: ArtworkRegionRecord[] }>(override).regions;
  }
  if (record.regions?.length) return record.regions;
  return derivedRegions(record);
}

/**
 * Thread Pull needs somewhere to pull from on every canvas, not only the ones
 * with hand-authored regions. Falling back to three horizontal registers —
 * upper, middle, foreground — carrying successive passages of the work's own
 * extended note keeps the interaction alive everywhere, and any work that
 * deserves better gets `regions` written into its record.
 */
function derivedRegions(record: ArtworkRecord): ArtworkRegionRecord[] {
  const paragraphs = record.extendedNote
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];

  const passages = [record.labelText, ...paragraphs];
  const bands: Array<{ id: string; label: string; box: [number, number, number, number] }> = [
    { id: 'upper', label: 'The upper register', box: [0.0, 0.0, 1.0, 0.34] },
    { id: 'middle', label: 'The middle ground', box: [0.0, 0.34, 1.0, 0.68] },
    { id: 'foreground', label: 'The foreground', box: [0.0, 0.68, 1.0, 1.0] },
  ];

  return bands.map((band, i) => ({
    ...band,
    text: passages[i % passages.length],
  }));
}
