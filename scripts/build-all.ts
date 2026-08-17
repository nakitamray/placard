/**
 * build-all.ts — spec §5 / M3
 *
 * `pnpm build:assets` regenerates every shipped asset from data/.
 *
 * For each museum in data/museums/order.json, for each work it hangs:
 *   1. images   → full.jpg, wall.jpg, lqip.webp
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
import { PUBLIC, artworkPublic, museumPublic } from './lib/paths.ts';
import { glyphConfig, loadMuseumWithWorks, museumOrder, regionsFor } from './lib/records.ts';
import { buildImages } from './build-images.ts';
import { buildCorpus } from './build-corpus.ts';
import { buildGlyphs } from './build-glyphs.ts';
import type { ArtworkRecord, MuseumRecord } from './lib/records.ts';

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

    const corpus = buildCorpus(record);

    const cfg = glyphConfig(record.id);
    await buildGlyphs(record.id, images.sourcePath, cfg);
    // low-tier variant: double the minimum cell → roughly a quarter of the glyphs
    await buildGlyphs(record.id, images.sourcePath, cfg, '-lo', cfg.minCell * 2);

    const full = await sharp(path.join(artworkPublic(record.id), 'full.jpg')).metadata();
    const meta = buildMeta(record, museum, images.authentic, corpus, full);
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

// landing backgrounds
const landingDir = path.join(PUBLIC, 'landing');
fs.mkdirSync(landingDir, { recursive: true });
const manifest: string[] = [];
let n = 1;
for (const pick of landingPicks) {
  const name = `${String(n).padStart(2, '0')}-${pick.id}.jpg`;
  await sharp(path.join(artworkPublic(pick.id), 'full.jpg'))
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(landingDir, name));
  manifest.push(name);
  n++;
}
fs.writeFileSync(path.join(landingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const total = authenticCount + generatedCount;
console.log(`\n▸ ${museums.length} museums, ${total} works`);
console.log(`▸ landing: ${manifest.length} backgrounds`);
if (generatedCount) {
  console.log(
    `\n⚠ ${generatedCount}/${total} works are rendering procedural stand-ins.\n` +
      `  Drop a public-domain scan at data/artworks/{id}/source.jpg and rebuild\n` +
      `  to replace one — see the README, "Authentic scans".`,
  );
}
console.log('\ndone.');

/* ── meta.json assembly ─────────────────────────────────────────────────── */

function buildMeta(
  record: ArtworkRecord,
  museum: MuseumRecord,
  authentic: boolean,
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
    image: {
      file: 'full.jpg',
      source: authentic
        ? 'Public-domain scan supplied at data/artworks/{id}/source.jpg'
        : 'Procedural stand-in generated by Placard — no scan supplied for this work',
      license: authentic ? 'PD-Art' : 'CC0 (generated)',
      photoCredit: '',
    },
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
