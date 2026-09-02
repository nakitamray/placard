/**
 * build-all.ts — spec §5 / M3
 *
 * `pnpm build:assets` regenerates every shipped asset from data/.
 *
 * For each museum in data/museums/order.json, for each work it hangs:
 *   1. images   → wall/view/full × avif+webp+jpg, lqip.webp
 *   2. corpus   → corpus.bin + segment offsets
 *   3. glyphs   → glyphs.bin (+ glyphs-lo.bin for the low device tier, §14.2)
 *   4. meta     → meta.json (placard + provenance + corpus table + geometry)
 *
 * then per museum:
 *   5. public/museums/{id}.json   corridor style + floor plan + artwork index
 *   6. public/museums/index.json  the landing page's list
 *   7. public/landing/            backgrounds drawn from every museum
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

/** kept in step with build-images.ts, which owns the flag */
const SKIP_AVIF = process.env.PLACARD_SKIP_AVIF === '1';

const museums = museumOrder();
const museumIndex: Array<{
  id: string;
  name: string;
  city: string;
  subtitle: string;
  count: number;
}> = [];
/** one representative image per museum for the landing slideshow */
const landingPicks: Array<{ museum: string; id: string }> = [];

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

    index.push({
      id: record.id,
      artist: record.artist,
      title: record.title,
      aspect: (full.width ?? 1) / (full.height ?? 1),
      accent: record.accentColor,
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
  // two backgrounds per museum keeps the landing slideshow varied without
  // shipping fifty full-size jpegs the landing page would never reach
  landingPicks.push({ museum: museumId, id: works[0].id });
  if (works.length > 4) landingPicks.push({ museum: museumId, id: works[4].id });
}

fs.writeFileSync(
  path.join(PUBLIC, 'museums', 'index.json'),
  JSON.stringify(museumIndex, null, 2),
);

/*
 * Landing backgrounds.
 *
 * These are the first bytes anyone downloads, before a single museum has been
 * chosen, so they are the whole first impression of how fast this place is.
 * Ten full-bleed 1920px jpegs used to be fetched the moment the page mounted —
 * the browser sees ten `background-image` declarations and honours all ten,
 * even though nine of them are behind `opacity: 0`. They are now published at
 * 1600px in three formats and the slideshow mounts two at a time (see
 * src/ui/LandingLayer.tsx), so the landing page costs one picture instead of
 * ten.
 */
const landingDir = path.join(PUBLIC, 'landing');
fs.mkdirSync(landingDir, { recursive: true });
const landingFormats = SKIP_AVIF ? ['webp', 'jpg'] : ['avif', 'webp', 'jpg'];
const manifest: string[] = [];
let landingBytes = 0;
let n = 1;
for (const pick of landingPicks) {
  const stem = `${String(n).padStart(2, '0')}-${pick.id}`;
  const at = () =>
    sharp(path.join(artworkPublic(pick.id), 'full.jpg')).resize({
      width: 1600,
      withoutEnlargement: true,
    });
  for (const fmt of landingFormats) {
    const pipe =
      fmt === 'avif'
        ? at().avif({ quality: 52, effort: 3 })
        : fmt === 'webp'
          ? at().webp({ quality: 72, effort: 4 })
          : at().jpeg({ quality: 76, mozjpeg: true });
    const info = await pipe.toFile(path.join(landingDir, `${stem}.${fmt}`));
    landingBytes += info.size;
  }
  manifest.push(stem);
  n++;
}
fs.writeFileSync(
  path.join(landingDir, 'manifest.json'),
  JSON.stringify({ files: manifest, formats: landingFormats }, null, 2),
);

const total = authenticCount + generatedCount;
console.log(`\n▸ ${museums.length} museums, ${total} works`);
console.log(
  `▸ landing: ${manifest.length} backgrounds, ${(landingBytes / 1024 / 1024).toFixed(1)} MB across ` +
    `${landingFormats.join('/')} — one is fetched on load`,
);
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
      source: `Wikimedia Commons — ${c.commonsFile}${c.descriptionUrl ? ` (${c.descriptionUrl})` : ''}`,
      license: c.license || 'see Commons',
      photoCredit: c.author || '',
    };
  }
  return {
    file: 'full.jpg',
    source: authentic
      ? 'Public-domain scan supplied at data/artworks/{id}/source.jpg'
      : 'Procedural stand-in generated by Placard — no scan supplied for this work',
    license: authentic ? 'PD-Art' : 'CC0 (generated)',
    photoCredit: '',
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
