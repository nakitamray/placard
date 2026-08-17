/**
 * build-all.ts — spec §5 / M3
 *
 * `pnpm build:assets` regenerates every shipped asset from data/:
 *   1. images   → full.jpg, wall.jpg, lqip.webp
 *   2. corpus   → corpus.bin + segment offsets
 *   3. glyphs   → glyphs.bin (+ glyphs-lo.bin for the low device tier, §14.2)
 *   4. meta     → meta.json (placard + provenance + corpus table + geometry)
 *   5. landing  → public/landing/ backgrounds (from the artwork fulls)
 *   6. gallery  → public/galleries/orsay.json copied from data/
 *
 * Adding a new artwork = a folder in data/artworks/ + a line in order.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DATA, PUBLIC, artworkData, artworkPublic } from './lib/paths.ts';
import { buildImages } from './build-images.ts';
import { buildCorpus } from './build-corpus.ts';
import { buildGlyphs } from './build-glyphs.ts';

const order: string[] = JSON.parse(
  fs.readFileSync(path.join(DATA, 'artworks', 'order.json'), 'utf8'),
);

const index: Array<{
  id: string;
  artist: string;
  title: string;
  aspect: number;
  accent: string;
}> = [];

for (const id of order) {
  console.log(`\n▸ ${id}`);
  await buildImages(id);
  const corpus = buildCorpus(id);
  await buildGlyphs(id);
  // low-tier variant: double the minimum cell → roughly a quarter of the glyphs
  const cfg = JSON.parse(fs.readFileSync(path.join(artworkData(id), 'config.json'), 'utf8'));
  await buildGlyphs(id, '-lo', cfg.minCell * 2);

  const placard = JSON.parse(fs.readFileSync(path.join(artworkData(id), 'placard.json'), 'utf8'));
  // Thread Pull semantic regions (normalised boxes → readable passages)
  const regionsPath = path.join(artworkData(id), 'regions.json');
  const regions = fs.existsSync(regionsPath)
    ? JSON.parse(fs.readFileSync(regionsPath, 'utf8')).regions
    : [];
  const full = await sharp(path.join(artworkPublic(id), 'full.jpg')).metadata();
  const meta = {
    ...placard,
    regions,
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
  fs.writeFileSync(path.join(artworkPublic(id), 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('  meta.json');

  index.push({
    id,
    artist: placard.artist,
    title: placard.title,
    aspect: (full.width ?? 1) / (full.height ?? 1),
    // per-artist wall tone, so each painting reads against its own ground
    accent: placard.accentColor ?? '#6E6B63',
  });
}

// artwork index for the runtime
fs.mkdirSync(path.join(PUBLIC, 'artworks'), { recursive: true });
fs.writeFileSync(path.join(PUBLIC, 'artworks', 'index.json'), JSON.stringify(index, null, 2));

// landing backgrounds — reuse the artwork fulls (spec §10.1: drop-in folder)
const landingDir = path.join(PUBLIC, 'landing');
fs.mkdirSync(landingDir, { recursive: true });
let n = 1;
for (const id of order) {
  const src = path.join(artworkPublic(id), 'full.jpg');
  await sharp(src)
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(landingDir, `${String(n).padStart(2, '0')}-${id}.jpg`));
  n++;
}
fs.writeFileSync(
  path.join(landingDir, 'manifest.json'),
  JSON.stringify(
    order.map((id, i) => `${String(i + 1).padStart(2, '0')}-${id}.jpg`),
    null,
    2,
  ),
);
console.log(`\n▸ landing: ${order.length} backgrounds`);

// gallery data
fs.mkdirSync(path.join(PUBLIC, 'galleries'), { recursive: true });
fs.copyFileSync(
  path.join(DATA, 'galleries', 'orsay.json'),
  path.join(PUBLIC, 'galleries', 'orsay.json'),
);
console.log('▸ galleries/orsay.json');
console.log('\ndone.');
