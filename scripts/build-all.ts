/**
 * build-all.ts
 *
 * `pnpm build:assets` regenerates every shipped asset from data/.
 *
 * For each museum in data/museums/order.json, for each work it hangs:
 *   1. images   → wall/view/full × avif+webp+jpg, lqip.webp
 *   2. corpus   → corpus.bin + segment offsets
 *   3. glyphs   → glyphs.bin (+ glyphs-lo.bin for the low device tier)
 *   4. meta     → meta.json (placard + provenance + corpus table + geometry)
 *
 * then per museum:
 *   5. public/museums/{id}.json   corridor style + floor plan + artwork index
 *   6. public/museums/index.json  the landing page's list
 *   7. public/museums/works.json  every work in the exhibition, for the entrance
 *
 * Adding a museum = two files in data/ and a line in order.json.
 * Adding a work   = one record in data/collections/{museum}.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PUBLIC, artworkData, artworkPublic, museumPublic } from './lib/paths.ts';
import {
  LOW_TIER_GLYPHS,
  glyphConfig,
  loadMuseumWithWorks,
  museumOrder,
  regionsFor,
} from './lib/records.ts';
import { buildImages, imageManifest, type BuiltImages } from './build-images.ts';
import { buildCorpus } from './build-corpus.ts';
import { buildGlyphs } from './build-glyphs.ts';
import type { ArtworkRecord, MuseumRecord } from './lib/records.ts';

/**
 * Where to hold a picture the entrance has to crop, when the record does not
 * say. A tall canvas is nearly always a figure, and a figure's head is above
 * the middle of it; everything else is held in the centre.
 */
function defaultFocus(aspect: number): [number, number] {
  return aspect < 0.85 ? [0.5, 0.4] : [0.5, 0.5];
}

const museums = museumOrder();
const museumIndex: Array<{
  id: string;
  name: string;
  city: string;
  subtitle: string;
  count: number;
}> = [];
/**
 * Every work in the exhibition, flat, for the entrance.
 *
 * The entrance draws from all of them rather than from a shortlist, so this is
 * the list it reads: enough to choose a work, size it and hold it in frame,
 * and nothing else. It carries no bytes of its own — the pictures it names are
 * the ones already published per artwork.
 */
const exhibition: Array<{
  id: string;
  museum: string;
  artist: string;
  title: string;
  aspect: number;
  focus: [number, number];
}> = [];

let generatedCount = 0;
let authenticCount = 0;
/** running totals, so the build says out loud what it is asking a visitor to download */
let publishedBytes = 0;
let glyphBytes = 0;

for (const museumId of museums) {
  const { museum, works } = loadMuseumWithWorks(museumId);
  console.log(`\n══ ${museum.name} — ${works.length} works`);

  const index: Array<{
    id: string;
    artist: string;
    title: string;
    aspect: number;
    accent: string;
  }> = [];

  for (const record of works) {
    console.log(`\n▸ ${record.id}`);
    const images = await buildImages(record);
    images.authentic ? authenticCount++ : generatedCount++;
    publishedBytes += Object.values(images.bytes).reduce((a, b) => a + b, 0);

    const corpus = buildCorpus(record);

    const cfg = glyphConfig(record.id);
    await buildGlyphs(record.id, images.sourcePath, cfg);
    // low-tier variant: double both cell bounds → roughly a quarter of the glyphs
    await buildGlyphs(record.id, images.sourcePath, cfg, '-lo', LOW_TIER_GLYPHS(cfg));

    for (const f of ['glyphs.bin', 'glyphs-lo.bin']) {
      glyphBytes += fs.statSync(path.join(artworkPublic(record.id), f)).size;
    }

    const full = await sharp(path.join(artworkPublic(record.id), 'full.jpg')).metadata();
    const meta = buildMeta(record, museum, images, corpus, full);
    fs.writeFileSync(
      path.join(artworkPublic(record.id), 'meta.json'),
      JSON.stringify(meta, null, 2),
    );

    const aspect = (full.width ?? 1) / (full.height ?? 1);
    index.push({
      id: record.id,
      artist: record.artist,
      title: record.title,
      aspect,
      accent: record.accentColor,
    });
    exhibition.push({
      id: record.id,
      museum: museum.id,
      artist: record.artist,
      title: record.title,
      aspect,
      focus: record.heroFocus ?? defaultFocus(aspect),
    });
  }

  // museum manifest the runtime loads when a museum is chosen
  fs.mkdirSync(path.join(PUBLIC, 'museums'), { recursive: true });
  fs.writeFileSync(
    museumPublic(museumId),
    JSON.stringify(
      {
        id: museum.id,
        name: museum.name,
        city: museum.city,
        subtitle: museum.subtitle,
        blurb: museum.blurb,
        corridorNote: museum.corridorNote,
        style: museum.style,
        plan: museum.plan,
        artworks: index,
      },
      null,
      2,
    ),
  );
  console.log(`\n  → public/museums/${museumId}.json`);

  museumIndex.push({
    id: museum.id,
    name: museum.name,
    city: museum.city,
    subtitle: museum.subtitle,
    count: index.length,
  });
}

fs.writeFileSync(
  path.join(PUBLIC, 'museums', 'index.json'),
  JSON.stringify(museumIndex, null, 2),
);

fs.writeFileSync(
  path.join(PUBLIC, 'museums', 'works.json'),
  JSON.stringify(exhibition, null, 2),
);

const total = authenticCount + generatedCount;
console.log(`\n▸ ${museums.length} museums, ${total} works`);
console.log(`▸ entrance: draws from all ${exhibition.length}, one at a time`);
console.log(
  `▸ published: ${(publishedBytes / 1024 / 1024).toFixed(1)} MB of pictures, ` +
    `${(glyphBytes / 1024 / 1024).toFixed(1)} MB of glyphs`,
);
if (generatedCount) {
  console.log(
    `\n⚠ ${generatedCount}/${total} works are rendering procedural stand-ins.\n` +
      `  Drop a public-domain scan at data/artworks/{id}/source.jpg and rebuild\n` +
      `  to replace one — see the README, "Authentic scans".`,
  );
}
console.log('\ndone.');

/* ── meta.json assembly ─────────────────────────────────────────────────── */

/**
 * What the Credits panel says about where a picture came from.
 *
 * `pnpm fetch:images` writes image-credit.json next to each scan it pulls,
 * carrying the Commons file, its stated licence and its author. Publishing
 * that verbatim is the point: a public exhibition has to be able to say which
 * reproduction it is showing and under what terms, and a hand-waved
 * "PD-Art" is not that.
 */
function imageProvenance(id: string, authentic: boolean) {
  const creditPath = path.join(artworkData(id), 'image-credit.json');
  if (authentic && fs.existsSync(creditPath)) {
    const c = JSON.parse(fs.readFileSync(creditPath, 'utf8'));
    return {
      file: 'full.jpg',
      source: 'Wikimedia Commons',
      commonsFile: c.commonsFile ?? '',
      url: c.descriptionUrl ?? '',
      license: c.license || 'see Commons',
      photoCredit: c.author || '',
      note: c.crop ?? '',
    };
  }
  return {
    file: 'full.jpg',
    source: authentic ? 'Scan supplied with the record' : 'Procedural stand-in',
    commonsFile: '',
    url: '',
    license: authentic ? 'PD-Art' : 'CC0 (generated)',
    photoCredit: '',
    note: authentic ? '' : 'No reproduction is published for this work yet.',
  };
}

function buildMeta(
  record: ArtworkRecord,
  museum: MuseumRecord,
  images: BuiltImages,
  corpus: ReturnType<typeof buildCorpus>,
  full: sharp.Metadata,
) {
  return {
    id: record.id,
    artist: record.artist,
    artistDates: record.artistDates,
    title: record.title,
    titleOriginal: record.titleOriginal ?? '',
    year: record.year,
    medium: record.medium,
    dimensions: record.dimensions,
    housedAt: {
      institution: museum.name,
      city: museum.city,
      room: record.room,
      accession: record.accession,
      creditLine: record.creditLine,
    },
    labelText: record.labelText,
    extendedNote: record.extendedNote,
    textProvenance: {
      type: 'placard_original',
      attribution:
        'Wall label and extended note written for Placard; catalogue details stated from published museum records',
      url: '',
    },
    image: imageProvenance(record.id, images.authentic),
    images: imageManifest(images.bytes),
    accentColor: record.accentColor,
    regions: regionsFor(record),
    corpus: {
      length: corpus.length,
      segments: corpus.segments,
      sources: corpus.sources.map(({ id, title, url, license, attribution }) => ({
        id,
        title,
        url,
        license,
        attribution,
      })),
    },
    imageWidth: full.width,
    imageHeight: full.height,
  };
}
