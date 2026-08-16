/**
 * build-images.ts — spec §5.4
 *
 * Per artwork, via sharp:
 *   full.jpg   2000px long edge, q86, mozjpeg   (the reveal image)
 *   wall.jpg    512px long edge, q80            (corridor / LOD texture)
 *   lqip.webp    24px long edge, q40, blurred   (blur-up placeholder)
 *
 * The source of truth is data/artworks/{id}/source.jpg — a PD-Art scan from
 * Wikimedia Commons. When it is absent (this environment cannot reach
 * Wikimedia), placeholder.svg is rasterised to source.generated.png and used
 * instead, so the whole pipeline still runs end-to-end. Drop the real scan in
 * and rebuild; nothing else changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DATA, artworkData, artworkPublic } from './lib/paths.ts';

export async function buildImages(id: string) {
  const dir = artworkData(id);
  const outDir = artworkPublic(id);
  fs.mkdirSync(outDir, { recursive: true });

  let source = path.join(dir, 'source.jpg');
  if (!fs.existsSync(source)) {
    const svg = path.join(dir, 'placeholder.svg');
    if (!fs.existsSync(svg)) throw new Error(`${id}: neither source.jpg nor placeholder.svg`);
    source = path.join(dir, 'source.generated.png');
    await sharp(svg, { density: 96 }).png().toFile(source);
    console.log(`  (no source.jpg — rasterised placeholder.svg)`);
  }

  const meta = await sharp(source).metadata();
  const landscape = (meta.width ?? 1) >= (meta.height ?? 1);
  const long = (n: number) => (landscape ? { width: n } : { height: n });

  await sharp(source)
    .resize({ ...long(2000), withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(outDir, 'full.jpg'));

  await sharp(source)
    .resize({ ...long(512) })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(outDir, 'wall.jpg'));

  await sharp(source)
    .resize({ ...long(24) })
    .blur(1.5)
    .webp({ quality: 40 })
    .toFile(path.join(outDir, 'lqip.webp'));

  console.log(`  full.jpg / wall.jpg / lqip.webp`);
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const order: string[] = JSON.parse(
    fs.readFileSync(path.join(DATA, 'artworks', 'order.json'), 'utf8'),
  );
  for (const id of order) {
    console.log(id);
    await buildImages(id);
  }
}
