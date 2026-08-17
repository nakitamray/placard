/**
 * build-images.ts — spec §5.4
 *
 * Per artwork, via sharp:
 *   full.jpg   2000px long edge, q86, mozjpeg   (the reveal image)
 *   wall.jpg    512px long edge, q80            (corridor / LOD texture)
 *   lqip.webp    24px long edge, q40, blurred   (blur-up placeholder)
 *
 * Source resolution, in order:
 *   1. data/artworks/{id}/source.jpg    a real public-domain scan
 *   2. data/artworks/{id}/placeholder.svg
 *   3. the record's `placeholder` spec, rendered procedurally
 *
 * Only the first is authentic. The other two exist so the whole pipeline runs
 * with no network access and so a half-authored collection still builds; drop
 * a scan in at (1) and rebuild, and nothing else changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, artworkData, artworkPublic } from './lib/paths.ts';
import { renderPlaceholder } from './build-placeholder.ts';
import type { ArtworkRecord } from './lib/records.ts';

export interface BuiltImages {
  /** the file build-glyphs should analyse */
  sourcePath: string;
  authentic: boolean;
  width: number;
  height: number;
}

async function resolveSource(record: ArtworkRecord): Promise<{ file: string; authentic: boolean }> {
  const dir = artworkData(record.id);

  const scan = path.join(dir, 'source.jpg');
  if (fs.existsSync(scan)) return { file: scan, authentic: true };

  const generatedDir = path.join(CACHE, 'sources');
  fs.mkdirSync(generatedDir, { recursive: true });
  const generated = path.join(generatedDir, `${record.id}.png`);

  const handSvg = path.join(dir, 'placeholder.svg');
  if (fs.existsSync(handSvg)) {
    await sharp(handSvg, { density: 96 }).png().toFile(generated);
    return { file: generated, authentic: false };
  }

  if (!record.placeholder) {
    throw new Error(
      `${record.id}: no data/artworks/${record.id}/source.jpg and no "placeholder" spec in the record`,
    );
  }
  const svg = renderPlaceholder(record.placeholder);
  await sharp(Buffer.from(svg), { density: 96 }).png().toFile(generated);
  return { file: generated, authentic: false };
}

export async function buildImages(record: ArtworkRecord): Promise<BuiltImages> {
  const outDir = artworkPublic(record.id);
  fs.mkdirSync(outDir, { recursive: true });

  const { file: source, authentic } = await resolveSource(record);

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

  console.log(`  images     ${authentic ? 'from source.jpg' : 'generated stand-in'}`);
  return {
    sourcePath: source,
    authentic,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}
