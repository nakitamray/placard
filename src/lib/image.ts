/**
 * Which picture to actually ask for.
 *
 * Every artwork is published in three sizes and three formats. The size is a
 * decision about *when* — the corridor never needs more than a thumbnail, and
 * the 2000px reproduction is worth its bytes only once a visitor is standing
 * in front of one painting looking at it. The format is a decision the browser
 * makes for us: the same painting is roughly a third smaller as AVIF than as
 * JPEG and a quarter smaller as WebP, for no visible difference at these
 * quality settings, so we publish all three and hand each browser the smallest
 * one it can decode.
 *
 * Support is probed once, with a two-pixel image of each format, and the
 * answer is memoised for the session. Probing beats sniffing the user agent:
 * it is three decodes of 350 bytes, it cannot be wrong, and it degrades to
 * plain JPEG on anything that fails.
 */
import { asset } from './asset';

export type ImageFormat = 'avif' | 'webp' | 'jpg';

/** the reveal ladder — see scripts/build-images.ts, which writes them */
export type ImageSize = 'wall' | 'view' | 'full';

/** 2×2 pixels, the smallest thing each encoder will emit */
const PROBES: Record<'avif' | 'webp', string> = {
  webp: 'data:image/webp;base64,UklGRioAAABXRUJQVlA4IB4AAABQAQCdASoCAAIABUB8JQBOgC6gAP7u07snejVygAA=',
  avif:
    'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAOptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAEOAAEAAAAAAAAAGAAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAamlwcnAAAABLaXBjbwAAABNjb2xybmNseAABAA0ABoAAAAAMYXYxQ4EgAgAAAAAUaXNwZQAAAAAAAAACAAAAAgAAABBwaXhpAAAAAAMICAgAAAAXaXBtYQAAAAAAAAABAAEEAYIDBAAAACBtZGF0EgAKBzgANhAQ0GkyCxyAAABAALATqPHA',
};

function decodes(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 2);
    img.onerror = () => resolve(false);
    img.src = dataUri;
  });
}

let probe: Promise<ImageFormat> | null = null;

/** The best format this browser can decode. Probed once, then cached. */
function bestFormat(): Promise<ImageFormat> {
  if (probe) return probe;
  probe = (async () => {
    if (typeof Image === 'undefined') return 'jpg';
    if (await decodes(PROBES.avif)) return 'avif';
    if (await decodes(PROBES.webp)) return 'webp';
    return 'jpg';
  })();
  return probe;
}

/**
 * Synchronous best guess, for the very first frame — before the probe has
 * resolved we assume WebP, which every browser released since 2020 supports
 * and which is never worse than JPEG. Anything that cannot decode it falls
 * back through the loader's error path.
 */
let settled: ImageFormat | null = null;
void bestFormat().then((f) => {
  settled = f;
});

/** URL of one published variant, in the best format known so far. */
export function imageUrl(id: string, size: ImageSize, format?: ImageFormat): string {
  const fmt = format ?? settled ?? 'webp';
  return asset(`artworks/${id}/${size}.${fmt}`);
}

/** Same, but waits for the probe — use wherever a frame's delay does not matter. */
export async function imageUrlAsync(id: string, size: ImageSize): Promise<string> {
  return imageUrl(id, size, await bestFormat());
}

/** Fall back one rung when a variant fails to load (old Safari, odd proxies). */
export function fallbackUrl(url: string): string | null {
  if (url.endsWith('.avif')) return url.replace(/\.avif$/, '.webp');
  if (url.endsWith('.webp')) return url.replace(/\.webp$/, '.jpg');
  return null;
}
