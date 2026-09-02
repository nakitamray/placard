/**
 * fetch-images.ts — pull the real paintings from Wikimedia Commons.
 *
 *   pnpm fetch:images --dry           resolve everything, download nothing
 *   pnpm fetch:images                 fetch every work that has no scan yet
 *   pnpm fetch:images --force         re-fetch works that already have one
 *   pnpm fetch:images --pin           write the resolved file names back
 *   pnpm fetch:images --concurrency 6
 *   pnpm fetch:images --museum louvre
 *   pnpm fetch:images --only leonardo-mona-lisa,manet-olympia
 *
 * For each work it resolves a Commons file, downloads a 2000px render, and
 * writes:
 *
 *   data/artworks/{id}/source.jpg          the scan the whole pipeline prefers
 *   data/artworks/{id}/image-credit.json   file, licence, author, source URL
 *
 * Then run `pnpm build:assets` and the exhibition is hanging real paintings
 * with real attribution on every placard.
 *
 * WHAT IT ASKS FOR
 * ----------------
 * Commons will render any file to a width you name, so this asks for exactly
 * the 2000px the published ladder tops out at rather than pulling the master
 * scan — which for a well-photographed painting can be eighty megapixels and
 * a hundred megabytes. Fifty works come down in something like fifteen
 * megabytes total, and nothing is downloaded that the build then throws away.
 *
 * Several works are resolved at once, but every outbound request still goes
 * through one gate that keeps them a fixed interval apart, so the whole run
 * stays inside what Commons asks of automated clients however wide the pool
 * is opened.
 *
 * HOW A FILE IS CHOSEN
 * --------------------
 * data/image-sources.json carries a `search` string per work and, optionally,
 * an exact `commonsFile`. An exact file is used as given; otherwise the
 * Commons search API is asked and candidates are scored on resolution, format
 * and how much of the artist's name and title appear in the file name.
 *
 * Search can be wrong, and a wrong painting hung under the right label is
 * worse than no painting at all — so nothing here is silent. Every run prints
 * what it resolved and writes the same table to
 * data/.cache/fetch-report.json. Run `--dry` first, read the table, and pin
 * anything that looks off by adding `commonsFile` to data/image-sources.json.
 *
 * `--pin` does the same thing for the ones that came out right: it writes
 * every resolved file name back into data/image-sources.json, so from then on
 * the run is a lookup rather than a search. Worth doing once and committing —
 * search rankings drift, and an exhibition that hangs a different picture
 * next month is not one you can point people at.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE, DATA, artworkData } from './lib/paths.ts';
import { loadMuseumWithWorks, museumOrder } from './lib/records.ts';

/** Wikimedia asks every automated client to identify itself and give a contact. */
const USER_AGENT =
  'Placard/1.0 (art-exhibition project; https://github.com/nakitamray/placard) node-fetch';
const API = 'https://commons.wikimedia.org/w/api.php';
/** long edge to request — the top rung of the published ladder, no more */
const TARGET_WIDTH = 2000;
/** anything smaller than this is not worth hanging */
const MIN_LONG_EDGE = 900;
/** minimum gap between outbound requests, however many are in flight */
const DELAY_MS = 250;
/** works resolved at once — the gate above still paces the requests */
const DEFAULT_CONCURRENCY = 4;

interface SourceHint {
  search?: string;
  commonsFile?: string;
  note?: string;
}

interface Resolved {
  id: string;
  museum: string;
  title: string;
  artist: string;
  file: string;
  descriptionUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  license: string;
  author: string;
  credit: string;
  score: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One gate for every outbound request.
 *
 * Widening the pool is only polite if it does not also multiply the request
 * rate, so each caller waits here until DELAY_MS has passed since the last
 * one was let through. Four workers then behave like one client making a
 * steady four-per-second, not four clients bursting at Commons together.
 */
let gate: Promise<void> = Promise.resolve();
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const mine = gate.then(() => sleep(DELAY_MS));
  gate = mine;
  return mine.then(fn);
}

const stripHtml = (s: string) =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function api(params: Record<string, string>, attempt = 1): Promise<any> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  try {
    const res = await paced(() => fetch(url, { headers: { 'User-Agent': USER_AGENT } }));
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 4) throw err;
    // 2s, 4s, 8s — Commons throttles bursts rather than banning
    const wait = 2000 * 2 ** (attempt - 1);
    console.warn(`    retrying in ${wait / 1000}s (${(err as Error).message})`);
    await sleep(wait);
    return api(params, attempt + 1);
  }
}

/** normalised words used for scoring a candidate file name */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Prefer a big, plain photographic reproduction whose file name mentions the
 * artist and the title. Penalise the things Commons is full of that are not
 * the painting: details, frames, versions in other collections, engravings
 * after it, and anything obviously a diagram.
 */
export function scoreCandidate(
  fileName: string,
  width: number,
  height: number,
  mime: string,
  wanted: string[],
): number {
  const name = fileName.toLowerCase();
  let score = 0;

  const long = Math.max(width, height);
  score += Math.min(40, (long / TARGET_WIDTH) * 30);
  if (long < MIN_LONG_EDGE) score -= 60;

  for (const w of wanted) if (name.includes(w)) score += 6;

  if (/\.(jpe?g|png)$/.test(name)) score += 8;
  if (mime && !mime.startsWith('image/')) score -= 100;
  if (/\.svg$/.test(name)) score -= 100;

  for (const bad of [
    'detail',
    'frame',
    'framed',
    'copy',
    'after',
    'engraving',
    'sketch',
    'study',
    'replica',
    'diagram',
    'map',
    'signature',
    'x-ray',
    'infrared',
    'reverse',
    'verso',
    'label',
    'plaque',
    'museum',
    'gallery',
    'exhibition',
    'installation',
    'wikipedia',
  ]) {
    if (name.includes(bad)) score -= 14;
  }
  // photographs of the picture hanging on a wall, with people in front of it
  if (/(visitor|crowd|tourist|room|interior|hall)/.test(name)) score -= 25;

  return score;
}

async function resolveFile(
  id: string,
  hint: SourceHint,
  artist: string,
  title: string,
): Promise<Omit<Resolved, 'id' | 'museum'> | null> {
  const wanted = keywords(`${artist} ${title}`);

  const imageinfo = (page: any) => page?.imageinfo?.[0];
  const build = (page: any, score: number) => {
    const info = imageinfo(page);
    if (!info) return null;
    const meta = info.extmetadata ?? {};
    return {
      title,
      artist,
      file: page.title as string,
      descriptionUrl: info.descriptionurl ?? '',
      downloadUrl: info.thumburl ?? info.url,
      width: info.thumbwidth ?? info.width,
      height: info.thumbheight ?? info.height,
      license: stripHtml(meta.LicenseShortName?.value) || 'see Commons',
      author: stripHtml(meta.Artist?.value) || artist,
      credit: stripHtml(meta.Credit?.value),
      score,
    };
  };

  // 1. an exact file, pinned by hand in data/image-sources.json
  if (hint.commonsFile) {
    const file = hint.commonsFile.startsWith('File:')
      ? hint.commonsFile
      : `File:${hint.commonsFile}`;
    const json = await api({
      action: 'query',
      titles: file,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(TARGET_WIDTH),
    });
    const pages: any[] = Object.values(json?.query?.pages ?? {});
    const page = pages.find((p) => !p.missing && p.imageinfo);
    if (page) return build(page, 999);
    console.warn(`    pinned file not found: ${file} — falling back to search`);
  }

  // 2. search Commons and score what comes back
  const query = hint.search ?? `${artist} ${title}`;
  const json = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(TARGET_WIDTH),
  });

  const pages: any[] = Object.values(json?.query?.pages ?? {});
  const scored = pages
    .map((page) => {
      const info = imageinfo(page);
      if (!info) return null;
      return build(
        page,
        scoreCandidate(page.title, info.width, info.height, info.mime ?? '', wanted),
      );
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

async function download(
  target: Resolved,
): Promise<{ width: number; height: number; bytes: number }> {
  const res = await paced(() =>
    fetch(target.downloadUrl, { headers: { 'User-Agent': USER_AGENT } }),
  );
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Never write the file straight through: Commons will happily serve an HTML
  // error page with a 200, and a 4KB "image" that fails at build time is far
  // more confusing than a failure here.
  const meta = await sharp(buf).metadata();
  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (long < MIN_LONG_EDGE) throw new Error(`too small: ${meta.width}×${meta.height}`);

  const dir = artworkData(target.id);
  fs.mkdirSync(dir, { recursive: true });
  // The scan on disk is an intermediate, not something anyone downloads: the
  // build re-encodes it nine ways. q90 is invisibly different from q92 here
  // and noticeably smaller in the CI cache that has to carry all fifty.
  const written = await sharp(buf)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(path.join(dir, 'source.jpg'));

  fs.writeFileSync(
    path.join(dir, 'image-credit.json'),
    JSON.stringify(
      {
        commonsFile: target.file,
        descriptionUrl: target.descriptionUrl,
        license: target.license,
        author: target.author,
        credit: target.credit,
        width: meta.width,
        height: meta.height,
        fetchedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );

  return { width: meta.width ?? 0, height: meta.height ?? 0, bytes: written.size };
}

/* ── CLI ────────────────────────────────────────────────────────────────── */

// importing this module (the scorer is unit-tested) must not start a run
const invokedDirectly =
  !!process.argv[1] && path.basename(process.argv[1]).startsWith('fetch-images');

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dry = flag('dry');
const force = flag('force');
const pin = flag('pin');
const onlyIds = value('only')?.split(',').map((s) => s.trim());
const onlyMuseum = value('museum');
const concurrency = Math.max(1, Math.min(8, Number(value('concurrency') ?? DEFAULT_CONCURRENCY)));

if (invokedDirectly) await run();

interface Job {
  id: string;
  museum: string;
  artist: string;
  title: string;
}

interface Outcome {
  id: string;
  status: 'fetched' | 'resolved' | 'skipped' | 'failed';
  lines: string[];
  bytes: number;
  file?: string;
  entry: Record<string, unknown>;
}

async function run() {
  const hintsPath = path.join(DATA, 'image-sources.json');
  const hints: Record<string, SourceHint> = JSON.parse(fs.readFileSync(hintsPath, 'utf8'));

  const jobs: Job[] = [];
  for (const museumId of museumOrder()) {
    if (onlyMuseum && museumId !== onlyMuseum) continue;
    const { works } = loadMuseumWithWorks(museumId);
    for (const w of works) {
      if (onlyIds && !onlyIds.includes(w.id)) continue;
      jobs.push({ id: w.id, museum: museumId, artist: w.artist, title: w.title });
    }
  }

  console.log(
    `\n${dry ? 'Resolving' : 'Fetching'} ${jobs.length} work${jobs.length === 1 ? '' : 's'} ` +
      `from Wikimedia Commons at ${TARGET_WIDTH}px, ${concurrency} at a time\n`,
  );

  const results = new Map<string, Outcome>();
  let next = 0;

  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const out = await one(job, hints[job.id] ?? {});
      results.set(job.id, out);
      // print each work's whole story at once — with several in flight,
      // interleaved half-lines are unreadable
      process.stdout.write(out.lines.join('\n') + '\n');
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  // in job order, not completion order
  const report = jobs.map((j) => results.get(j.id)!.entry);
  const tally = (s: Outcome['status']) =>
    jobs.filter((j) => results.get(j.id)!.status === s).length;
  const bytes = jobs.reduce((a, j) => a + results.get(j.id)!.bytes, 0);

  if (pin && !dry) {
    // Pin what was resolved, so the next run — and every CI run after it —
    // fetches the same picture without searching for it again. Search results
    // move; a hung exhibition should not.
    let pinned = 0;
    for (const job of jobs) {
      const out = results.get(job.id)!;
      if (out.status !== 'fetched' || !out.file) continue;
      const hint = (hints[job.id] ??= {});
      if (hint.commonsFile === out.file) continue;
      hint.commonsFile = out.file;
      pinned++;
    }
    if (pinned) {
      fs.writeFileSync(hintsPath, JSON.stringify(hints, null, 2) + '\n');
      console.log(`\npinned ${pinned} file name${pinned === 1 ? '' : 's'} into data/image-sources.json`);
    }
  }

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, 'fetch-report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(
    `\n${dry ? 'resolved' : 'fetched'}: ${dry ? tally('resolved') : tally('fetched')}` +
      `   skipped: ${tally('skipped')}   failed: ${tally('failed')}` +
      (bytes ? `   downloaded: ${(bytes / 1024 / 1024).toFixed(1)} MB` : ''),
  );
  console.log('report: data/.cache/fetch-report.json');
  if (!dry && tally('fetched')) console.log('\nNow run:  pnpm build:assets');
  if (tally('failed')) {
    console.log(
      '\nFor anything that failed or looks wrong, open the work on Commons and add\n' +
        'its exact file name to data/image-sources.json as "commonsFile", then re-run\n' +
        'with --force --only <id>.',
    );
  }
}

/** one work, start to finish, with its output buffered */
async function one(job: Job, hint: SourceHint): Promise<Outcome> {
  const lines: string[] = [`▸ ${job.id}`];
  const existing = path.join(artworkData(job.id), 'source.jpg');

  if (!force && fs.existsSync(existing) && !changedPin(job.id, hint)) {
    return {
      id: job.id,
      status: 'skipped',
      lines: [`· ${job.id} — already has a scan, skipping`],
      bytes: 0,
      entry: { id: job.id, status: 'skipped' },
    };
  }

  try {
    const found = await resolveFile(job.id, hint, job.artist, job.title);
    if (!found) throw new Error('no candidate found on Commons');

    const target: Resolved = { ...found, id: job.id, museum: job.museum };
    lines.push(`    ${target.file}${hint.commonsFile ? ' (pinned)' : ''}`);
    lines.push(`    ${target.width}×${target.height} · ${target.license}`);

    if (dry) {
      return {
        id: job.id,
        status: 'resolved',
        lines,
        bytes: 0,
        file: target.file,
        entry: { id: job.id, status: 'resolved', ...targetSummary(target) },
      };
    }

    const got = await download(target);
    lines.push(
      `    → data/artworks/${job.id}/source.jpg (${got.width}×${got.height}, ${(got.bytes / 1024) | 0} KB)`,
    );
    return {
      id: job.id,
      status: 'fetched',
      lines,
      bytes: got.bytes,
      file: target.file,
      entry: { id: job.id, status: 'fetched', ...targetSummary(target) },
    };
  } catch (err) {
    lines.push(`    FAILED: ${(err as Error).message}`);
    return {
      id: job.id,
      status: 'failed',
      lines,
      bytes: 0,
      entry: { id: job.id, status: 'failed', error: (err as Error).message },
    };
  }
}

/**
 * A scan on disk is stale if the record now pins a different Commons file
 * than the one it was fetched from — otherwise editing image-sources.json to
 * correct a wrong painting would appear to do nothing until someone
 * remembered `--force`.
 */
function changedPin(id: string, hint: SourceHint): boolean {
  if (!hint.commonsFile) return false;
  const creditPath = path.join(artworkData(id), 'image-credit.json');
  if (!fs.existsSync(creditPath)) return true;
  try {
    const c = JSON.parse(fs.readFileSync(creditPath, 'utf8'));
    const want = hint.commonsFile.startsWith('File:') ? hint.commonsFile : `File:${hint.commonsFile}`;
    return c.commonsFile !== want;
  } catch {
    return true;
  }
}

function targetSummary(t: Resolved) {
  return {
    file: t.file,
    url: t.descriptionUrl,
    size: `${t.width}×${t.height}`,
    license: t.license,
    author: t.author,
  };
}
