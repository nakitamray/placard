/**
 * build-images.ts — spec §5.4
 *
 * Publishes each painting as a ladder of three sizes in three formats, so the
 * browser only ever pays for the picture it is actually about to show:
 *
 *   wall  512px   the corridor thumbnail — ten of these hang in every room
 *   view 1200px   the reveal, at the size the canvas actually occupies
 *   full 2000px   the upgrade, fetched only while a visitor holds on one work
 *   lqip   24px   blurred, for the instant before anything else has landed
 *
 * and each of wall/view/full is written as AVIF, WebP and JPEG. The same
 * reproduction is roughly a third smaller as AVIF and a quarter smaller as
 * WebP at these quality settings, with nothing visible lost, so publishing all
 * three and letting each browser take the smallest it can decode is close to
 * free bandwidth. src/lib/image.ts does the picking.
 *
 * The old single `full.jpg` is still one rung of this ladder, so the glyph
 * pipeline, the landing backgrounds and every existing placard credit keep
 * working unchanged.
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

/** AVIF is the slowest encode in the build; skip it while iterating locally. */
const SKIP_AVIF = process.env.PLACARD_SKIP_AVIF === '1';

interface Rung {
  name: 'wall' | 'view' | 'full';
  long: number;
  jpeg: number;
  webp: number;
  avif: number;
}

/**
 * Quality per rung. These are not the same number in three costumes — the
 * three encoders' scales are unrelated, and matched by measurement against
 * these paintings rather than by assuming that q80 means anything in common.
 * AVIF above about 52 is unreliable on heavy impasto: at q58 a van Gogh comes
 * out *larger* than its JPEG, which is the one outcome that makes publishing
 * three formats a loss rather than a gain.
 */
const LADDER: Rung[] = [
  { name: 'wall', long: 512, jpeg: 78, webp: 70, avif: 48 },
  { name: 'view', long: 1200, jpeg: 82, webp: 76, avif: 50 },
  { name: 'full', long: 2000, jpeg: 84, webp: 76, avif: 50 },
];

/**
 * A modern format has to earn its place on every single work.
 *
 * The runtime picks a format once for the session and then asks for it
 * everywhere, so a work where AVIF happens to lose would silently cost the
 * visitor *more* than the JPEG they would otherwise have got. Rather than
 * publish that, drop the quality a notch and encode again until it wins.
 * Paintings that resist — dense brushwork, canvas weave, heavy craquelure —
 * give up a little fidelity in a format that degrades gracefully; everything
 * else is untouched, because everything else passes on the first try.
 */
const MUST_BEAT_JPEG_BY = 0.95;
const RETRY_STEP = 8;
const RETRIES = 2;

export interface BuiltImages {
  /** the file build-glyphs should analyse */
  sourcePath: string;
  authentic: boolean;
  width: number;
  height: number;
  /** bytes written per published variant, for the build report and meta.json */
  bytes: Record<string, number>;
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

  const bytes: Record<string, number> = {};
  const write = async (name: string, pipe: sharp.Sharp) => {
    const info = await pipe.toFile(path.join(outDir, name));
    bytes[name] = info.size;
    return info.size;
  };
  const conceded: string[] = [];

  for (const rung of LADDER) {
    // `wall` is a fixed-size LOD texture and must exist even for a small scan;
    // the two larger rungs never upscale, so a 900px scan simply publishes a
    // 900px "full" rather than a blurred 2000px one.
    const resize = { ...long(rung.long), withoutEnlargement: rung.name !== 'wall' };
    const at = () => sharp(source).resize(resize);

    const baseline = await write(
      `${rung.name}.jpg`,
      at().jpeg({ quality: rung.jpeg, mozjpeg: true }),
    );

    /** encode, and step the quality down until it actually beats the JPEG */
    const modern = async (
      ext: 'webp' | 'avif',
      start: number,
      encode: (q: number) => sharp.Sharp,
    ) => {
      let q = start;
      for (let attempt = 0; ; attempt++) {
        const size = await write(`${rung.name}.${ext}`, encode(q));
        if (size <= baseline * MUST_BEAT_JPEG_BY || attempt === RETRIES) {
          if (size > baseline * MUST_BEAT_JPEG_BY) conceded.push(`${rung.name}.${ext}`);
          return;
        }
        q -= RETRY_STEP;
      }
    };

    await modern('webp', rung.webp, (q) => at().webp({ quality: q, effort: 4 }));
    if (!SKIP_AVIF) {
      // effort 3 is within a percent of effort 4 on photographic scans and
      // roughly four times faster — this runs a hundred and fifty times.
      await modern('avif', rung.avif, (q) => at().avif({ quality: q, effort: 3 }));
    }
  }

  await write(
    'lqip.webp',
    sharp(source)
      .resize({ ...long(24) })
      .blur(1.5)
      .webp({ quality: 40 }),
  );

  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  const reveal = bytes['view.avif'] ?? bytes['view.webp'] ?? bytes['view.jpg'];
  console.log(
    `  images     ${authentic ? 'from source.jpg' : 'generated stand-in'} · ` +
      `${(reveal / 1024) | 0}KB reveal, ${(total / 1024) | 0}KB published` +
      (conceded.length ? `  [${conceded.join(', ')} no smaller than jpeg]` : ''),
  );
  return {
    sourcePath: source,
    authentic,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes,
  };
}

/** The variants that were published, for meta.json. */
export function imageManifest(bytes: Record<string, number>) {
  const formats = ['avif', 'webp', 'jpg'].filter((f) => bytes[`view.${f}`] !== undefined);
  return {
    formats,
    sizes: LADDER.map((r) => ({ name: r.name, long: r.long })),
    bytes,
  };
}
