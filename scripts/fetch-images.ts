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
 * Three steps, most trustworthy first. Each one falls through to the next.
 *
 *   1. `commonsFile` in data/image-sources.json — an exact file, used as
 *      given, because a person looked at it and said so.
 *   2. Wikidata. The work's own item carries P18: a curated statement that
 *      this file is the image *of this artwork*. The item is found by search
 *      and then proved before it is trusted — it has to be typed as an
 *      artwork, and its description has to name the artist — so a "Mona Lisa"
 *      that turns out to be a pop song is discarded rather than hung.
 *   3. Commons file search, scored.
 *
 * Scoring exists because search is the step that can be confidently wrong, and
 * a wrong painting hung under the right label is worse than no painting at
 * all. Candidates lose points for being the failure modes this exhibition
 * actually suffered: the work photographed *in its frame*, the work on a
 * gallery wall with visitors in front of it, an engraving after it, a detail,
 * or plainly a different painting. The sharpest test is arithmetic rather than
 * vocabulary — every record states the work's real dimensions, so its true
 * proportions are known before anything is downloaded, and a frame or a room
 * around the canvas changes them by far more than two reproductions of the
 * same painting ever differ. Anything that cannot clear ACCEPT_SCORE is
 * refused outright: a work left on its stand-in is honest, a wrong one is not.
 *
 * Every run prints what it resolved, writes the same table to
 * data/.cache/fetch-report.json, and builds
 * data/.cache/contact-sheet.html — one page showing all fifty pictures with
 * the file each came from. Open it. Fifty works is too many to check by
 * clicking through fifty Commons pages, and not checking is how an exhibition
 * ends up hanging a photograph of a frame.
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
/**
 * Below this, a search result is refused rather than hung.
 *
 * A work left on its procedural stand-in is honest and obvious. A wrong
 * painting under a real placard — or the right painting photographed in its
 * frame, or on a gallery wall with visitors in front of it — is neither, and
 * it is what search was quietly producing. Failing loudly is what makes the
 * report worth reading.
 */
const ACCEPT_SCORE = 30;
/** a downloaded scan whose proportions are this far off the catalogue is refused */
const MAX_ASPECT_ERROR = 0.1;

interface SourceHint {
  search?: string;
  /** an exact Commons file — used as given, because a human chose it */
  commonsFile?: string;
  /**
   * The work's Wikidata item, e.g. "Q12418" for the Mona Lisa. Its P18
   * property names the picture Wikidata considers the image *of that work* —
   * a curated statement about the artwork rather than a guess from a file
   * name, and checkable in one click at wikidata.org/wiki/Q12418.
   */
  wikidata?: string;
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

/** normalised words used for matching a candidate against the work */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/** words too common in art titles to be evidence that this is the right work */
const STOPWORDS = new Set([
  'the', 'and', 'with', 'from', 'for', 'her', 'his', 'その', 'una', 'the',
  'painting', 'portrait', 'study', 'view', 'saint', 'lady', 'young', 'man',
  'woman', 'girl', 'boy', 'scene', 'grand', 'great', 'petit', 'jeune',
]);

/**
 * The shape of the work itself, from the catalogue entry.
 *
 * This is the strongest signal available for the failure the exhibition
 * actually suffered from: a photograph of the painting *in its frame*, or
 * hanging on a gallery wall with the room around it. Both are the right
 * painting and the wrong picture, and both are immediately obvious as a
 * number — a frame adds fifteen to forty percent to one dimension and almost
 * never in the same proportion as the canvas.
 *
 * Every record carries its real dimensions ("92.7 × 73.7 cm"), so the true
 * aspect is known before anything is downloaded. Three records state a length
 * rather than a rectangle — a papyrus roll, a codex, a lunette measured at its
 * base — and those return null and are judged on everything else.
 */
export function expectedAspect(dimensions: string): number | null {
  const m = dimensions.match(/([\d.]+)\s*[x×]\s*([\d.]+)/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  // catalogue convention is height × width; the ratio we compare is width/height
  return h / w;
}

/** how far a candidate's proportions are from the catalogued ones, 0 = exact */
export function aspectError(expected: number | null, w: number, h: number): number {
  if (!expected || !w || !h) return 0;
  const got = w / h;
  return Math.abs(Math.log(got / expected));
}

/**
 * Things Commons is full of that are not the painting.
 *
 * Ordered roughly by how badly each one embarrasses the exhibition. A framed
 * photograph and a gallery snapshot are the two the visitor noticed, so they
 * are weighted hardest; engravings and copies after the work are the quiet
 * failure, because they look plausible until you know the painting.
 */
const REJECT: Array<{ re: RegExp; cost: number; printsOnly?: boolean }> = [
  // the picture of the picture: frame, glass, wall, room, people
  { re: /\b(frame|framed|cadre|rahmen|encadr)/, cost: 70 },
  { re: /\b(museum|musee|musée|gallery|galerie|exhibition|installation|display|vitrine)/, cost: 55 },
  { re: /\b(visitor|visitors|crowd|tourist|people|person|selfie|queue)/, cost: 90 },
  { re: /\b(room|hall|salle|saal|interior|wall of|hanging in|on display)/, cost: 55 },
  // the wrong object entirely — suppressed for works that *are* prints
  { re: /\b(engraving|etching|lithograph|woodcut|gravure|reproduction print)/, cost: 60, printsOnly: true },
  { re: /\b(copy|replica|after |version|imitation|forgery|pastiche|school of)/, cost: 55 },
  { re: /\b(sketch|study|drawing for|cartoon for|preparatory|modello)/, cost: 45 },
  // the right object, the wrong picture of it
  { re: /\b(detail|fragment|crop|closeup|close-up|verso|reverse|back of)/, cost: 60 },
  { re: /\b(x-ray|xray|infrared|reflectogram|ultraviolet|raking|before restoration|conservation)/, cost: 55 },
  { re: /\b(diagram|scheme|map of|plan of|signature|label|plaque|caption|logo|stamp)/, cost: 60 },
  { re: /\b(wikipedia|thumbnail|icon|banner|collage|montage|comparison)/, cost: 45 },
];

/**
 * Prefer a big, plain, correctly-proportioned photographic reproduction whose
 * file name and categories name the artist and the work.
 *
 * Scoring is deliberately harsh: a wrong painting hung under the right label
 * is worse than a stand-in, so a candidate that cannot prove it is the right
 * object should lose to one that can, and a whole run that finds nothing
 * acceptable should say so rather than hang something plausible.
 */
export function scoreCandidate(
  fileName: string,
  width: number,
  height: number,
  mime: string,
  wanted: string[],
  expected: number | null = null,
  categories = '',
  medium = '',
): number {
  const name = `${fileName} ${categories}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let score = 0;

  const long = Math.max(width, height);
  score += Math.min(40, (long / TARGET_WIDTH) * 30);
  if (long < MIN_LONG_EDGE) score -= 60;

  // naming the work is evidence; naming it several times is more evidence
  let matched = 0;
  for (const w of wanted) {
    if (STOPWORDS.has(w)) continue;
    if (name.includes(w)) {
      matched++;
      score += 7;
    }
  }
  // nothing distinctive in common with the work: almost certainly not it
  if (matched === 0) score -= 45;

  if (/\.(jpe?g|png|tiff?)$/.test(name)) score += 8;
  if (mime && !mime.startsWith('image/')) score -= 100;
  if (/\.svg$/.test(name)) score -= 100;

  /*
   * "Engraving" is only damning for a painting. Three of these works are
   * themselves prints — a Hokusai, a Hiroshige, a Dürer woodcut — and
   * penalising the word that correctly describes them would have thrown away
   * every good candidate and left them on stand-ins.
   */
  const isPrint = /\b(woodcut|woodblock|engraving|etching|lithograph|print|ukiyo)/i.test(medium);
  for (const { re, cost, printsOnly } of REJECT) {
    if (printsOnly && isPrint) continue;
    if (re.test(name)) score -= cost;
  }

  /*
   * Proportions. A frame, a mount or a photograph taken at an angle all show
   * up here, and nothing else does — two reproductions of the same painting
   * agree on their aspect ratio to well within a percent. The penalty is
   * continuous rather than a cutoff so that a slightly trimmed scan is only
   * slightly worse, while a picture half as wide again as the canvas is out
   * of contention whatever its file name says.
   */
  const err = aspectError(expected, width, height);
  if (err > 0.04) score -= Math.min(80, (err - 0.04) * 320);

  return score;
}

/* ── Wikidata ────────────────────────────────────────────────────────────
 *
 * The best available answer to "which picture is this painting" is not a file
 * name search. It is Wikidata's P18 property on the artwork's own item: a
 * curated statement that *this* file depicts *this* work, maintained by people
 * who care which of the forty scans on Commons is the plain one.
 *
 * Nothing here is hand-typed. The item is found by searching Wikidata for the
 * work and then *proving* the match before trusting it — the item has to be an
 * artwork rather than a film or a song of the same name, and its description
 * has to name the artist. A "Mona Lisa" that is a 1986 pop record fails both
 * and is discarded, and the run falls through to Commons search.
 */
const WD = 'https://www.wikidata.org/w/api.php';

/** things a P18 image is worth trusting for: paintings and other flat art */
const ARTWORK_TYPES = new Set([
  'Q3305213', // painting
  'Q838948', // work of art
  'Q93184', // drawing
  'Q11060274', // print
  'Q18761202', // watercolour painting
  'Q1223908', // fresco... (mural painting)
  'Q219423', // mural
  'Q22669139', // panel painting
  'Q133067', // altarpiece
  'Q46686', // tapestry
  'Q28966', // papyrus
  'Q213924', // codex
  'Q48498', // woodblock print
  'Q11835431', // ukiyo-e print
]);

async function wd(params: Record<string, string>): Promise<any> {
  const url = `${WD}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  const res = await paced(() => fetch(url, { headers: { 'User-Agent': USER_AGENT } }));
  if (!res.ok) throw new Error(`wikidata HTTP ${res.status}`);
  return res.json();
}

/** the Commons file a named Wikidata item gives as its image (P18) */
async function imageOfItem(qid: string): Promise<string | null> {
  const json = await wd({ action: 'wbgetclaims', entity: qid, property: 'P18' });
  const value = json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? `File:${value}` : null;
}

/**
 * Find the artwork on Wikidata and take its image, or return null having
 * proved nothing — never a guess.
 */
async function imageViaWikidataSearch(
  artist: string,
  title: string,
  titleOriginal?: string,
): Promise<{ file: string; qid: string } | null> {
  // the artist's surname is the discriminator that survives translation
  const surname = artist
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .pop()
    ?.toLowerCase();

  for (const query of [title, titleOriginal].filter(Boolean) as string[]) {
    const found = await wd({
      action: 'wbsearchentities',
      search: query,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '7',
    });
    const ids: string[] = (found?.search ?? []).map((r: any) => r.id).filter(Boolean);
    if (!ids.length) continue;

    const entities = await wd({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|descriptions',
      languages: 'en',
    });

    for (const qid of ids) {
      const item = entities?.entities?.[qid];
      if (!item) continue;

      const types: string[] = (item.claims?.P31 ?? [])
        .map((c: any) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
      if (!types.some((t) => ARTWORK_TYPES.has(t))) continue;

      // the description of an artwork item names its maker; an item for a
      // different work of the same title will name somebody else
      const description = String(item.descriptions?.en?.value ?? '').toLowerCase();
      if (surname && description && !description.includes(surname)) continue;

      const image = item.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof image === 'string') return { file: `File:${image}`, qid };
    }
  }
  return null;
}

async function fileInfo(file: string): Promise<any | null> {
  const json = await api({
    action: 'query',
    titles: file,
    prop: 'imageinfo|categories',
    cllimit: '60',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(TARGET_WIDTH),
  });
  const pages: any[] = Object.values(json?.query?.pages ?? {});
  return pages.find((p) => !p.missing && p.imageinfo) ?? null;
}

async function resolveFile(
  id: string,
  hint: SourceHint,
  work: {
    artist: string;
    title: string;
    titleOriginal?: string;
    dimensions: string;
    medium: string;
  },
): Promise<{ chosen: Omit<Resolved, 'id' | 'museum'>; how: string } | null> {
  const { artist, title, dimensions } = work;
  /*
   * Match against the work's names in every form it is catalogued under, not
   * just the English one. Commons files the Mona Lisa under "Mona Lisa" but
   * Vermeer's Girl under "Meisje met de parel" — judging a candidate on the
   * English title alone marks the single most canonical file for a work as a
   * stranger, which is worse than the problem the scoring exists to solve.
   */
  const wanted = keywords(
    [artist, title, work.titleOriginal ?? '', hint.search ?? ''].join(' '),
  );
  const expected = expectedAspect(dimensions);

  const build = (page: any, score: number) => {
    const info = page?.imageinfo?.[0];
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

  // 1. an exact file, pinned by hand in data/image-sources.json.
  //    Used as given: a human has looked at this one.
  if (hint.commonsFile) {
    const file = hint.commonsFile.startsWith('File:')
      ? hint.commonsFile
      : `File:${hint.commonsFile}`;
    const page = await fileInfo(file);
    if (page) {
      const chosen = build(page, 999);
      if (chosen) return { chosen, how: 'pinned' };
    }
    console.warn(`    pinned file not found: ${file} — falling back`);
  }

  // 2. Wikidata's own answer to "which picture is this work" (P18).
  //    A curated statement about the artwork rather than a guess from a file
  //    name, so it does not confuse a work with an engraving after it, and it
  //    is checkable in one click at wikidata.org/wiki/<qid>.
  try {
    const hit = hint.wikidata
      ? await imageOfItem(hint.wikidata).then((file) =>
          file ? { file, qid: hint.wikidata! } : null,
        )
      : await imageViaWikidataSearch(artist, title, work.titleOriginal);
    if (hit) {
      const page = await fileInfo(hit.file);
      const chosen = page && build(page, 900);
      // P18 is a curated statement, but it is still worth checking the
      // proportions: a handful of artwork items point at a photograph of the
      // work hanging in situ, and that is the exact picture to refuse.
      if (chosen && aspectError(expected, chosen.width, chosen.height) <= MAX_ASPECT_ERROR) {
        return { chosen, how: `wikidata ${hit.qid}` };
      }
      if (chosen) {
        console.warn(`    ${hit.qid} P18 has the wrong proportions — falling back to search`);
      }
    }
  } catch (err) {
    console.warn(`    wikidata lookup failed (${(err as Error).message}) — falling back`);
  }

  // 3. Search Commons and score what comes back, hardest last because it is
  //    the only step that can be confidently wrong.
  const query = hint.search ?? `${artist} ${title}`;
  const json = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo|categories',
    cllimit: '500',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(TARGET_WIDTH),
  });

  const pages: any[] = Object.values(json?.query?.pages ?? {});
  const scored = pages
    .map((page) => {
      const info = page?.imageinfo?.[0];
      if (!info) return null;
      const cats = (page.categories ?? []).map((c: any) => c.title).join(' ');
      const score = scoreCandidate(
        page.title,
        info.width,
        info.height,
        info.mime ?? '',
        wanted,
        expected,
        cats,
        work.medium,
      );
      return build(page, score);
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  /*
   * Refuse rather than hang something wrong.
   *
   * Everything below this line failed to name the work, or is the right work
   * photographed in its frame, or is a print after it. A work left on its
   * stand-in is honest and obvious; a wrong painting under a real placard is
   * neither, and it is what the exhibition was doing.
   */
  if (best.score < ACCEPT_SCORE) {
    throw new Error(
      `best candidate scored ${best.score.toFixed(0)} (< ${ACCEPT_SCORE}): ${best.file} — ` +
        `pin a commonsFile or wikidata id for this work`,
    );
  }
  return { chosen: best, how: `search, scored ${best.score.toFixed(0)}` };
}
async function download(
  target: Resolved,
  expected: number | null,
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

  // Last gate, on the real pixels rather than on the API's reported size. A
  // pinned file skips scoring entirely, so this is the only thing standing
  // between a hand-pinned photograph-of-a-frame and the exhibition wall.
  const err = aspectError(expected, meta.width ?? 0, meta.height ?? 0);
  if (err > MAX_ASPECT_ERROR) {
    const got = ((meta.width ?? 1) / (meta.height ?? 1)).toFixed(3);
    throw new Error(
      `proportions ${got} do not match the catalogued ${expected?.toFixed(3)} ` +
        `(off by ${(err * 100).toFixed(0)}%) — probably framed, cropped or the wrong work`,
    );
  }

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
const sheet = flag('sheet');
const concurrency = Math.max(1, Math.min(8, Number(value('concurrency') ?? DEFAULT_CONCURRENCY)));

if (invokedDirectly) await run();

interface Job {
  id: string;
  museum: string;
  artist: string;
  title: string;
  titleOriginal?: string;
  year: string;
  dimensions: string;
  medium: string;
}

interface Outcome {
  id: string;
  status: 'fetched' | 'resolved' | 'skipped' | 'failed';
  lines: string[];
  bytes: number;
  file?: string;
  /** how it was resolved: pinned, wikidata, or a search score */
  how?: string;
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
      jobs.push({
        id: w.id,
        museum: museumId,
        artist: w.artist,
        title: w.title,
        titleOriginal: w.titleOriginal,
        year: w.year,
        dimensions: w.dimensions,
        medium: w.medium,
      });
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
  if (!dry || sheet) writeContactSheet(jobs, results);

  console.log(
    `\n${dry ? 'resolved' : 'fetched'}: ${dry ? tally('resolved') : tally('fetched')}` +
      `   skipped: ${tally('skipped')}   failed: ${tally('failed')}` +
      (bytes ? `   downloaded: ${(bytes / 1024 / 1024).toFixed(1)} MB` : ''),
  );
  console.log('report: data/.cache/fetch-report.json');
  if (!dry || sheet) {
    console.log('review: data/.cache/contact-sheet.html  ← open this and look at all fifty');
  }
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
    const found = await resolveFile(job.id, hint, job);
    if (!found) throw new Error('no candidate found on Commons');
    const { chosen, how } = found;

    const target: Resolved = { ...chosen, id: job.id, museum: job.museum };
    lines.push(`    ${target.file}  (${how})`);
    lines.push(`    ${target.width}×${target.height} · ${target.license}`);

    const expected = expectedAspect(job.dimensions);
    if (expected) {
      const err = aspectError(expected, target.width, target.height);
      lines.push(
        `    proportions ${(target.width / target.height).toFixed(3)} vs catalogued ` +
          `${expected.toFixed(3)}  (${err < 0.02 ? 'match' : `off by ${(err * 100).toFixed(0)}%`})`,
      );
    }

    if (dry) {
      return {
        id: job.id,
        status: 'resolved',
        lines,
        bytes: 0,
        file: target.file,
        how,
        entry: { id: job.id, status: 'resolved', how, ...targetSummary(target) },
      };
    }

    const got = await download(target, expected);
    lines.push(
      `    → data/artworks/${job.id}/source.jpg (${got.width}×${got.height}, ${(got.bytes / 1024) | 0} KB)`,
    );
    return {
      id: job.id,
      status: 'fetched',
      lines,
      bytes: got.bytes,
      file: target.file,
      how,
      entry: { id: job.id, status: 'fetched', how, ...targetSummary(target) },
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
 * Every work, its picture and where the picture came from, on one page.
 *
 * Fifty works is too many to check by clicking through fifty Commons pages,
 * and not checking is how an exhibition ends up hanging a photograph of a
 * frame. This is the cheapest possible review: open one file, look down the
 * grid, and anything that is not the painting is obvious at a glance. Each
 * card carries the exact `commonsFile` and a copyable JSON line, so
 * correcting one is a paste into data/image-sources.json.
 */
function writeContactSheet(jobs: Job[], results: Map<string, Outcome>) {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cards = jobs
    .map((job) => {
      const out = results.get(job.id);
      const entry = (out?.entry ?? {}) as Record<string, string>;
      const has = fs.existsSync(path.join(artworkData(job.id), 'source.jpg'));
      const status = out?.status ?? 'skipped';
      const pinLine = esc(
        JSON.stringify({ [job.id]: { commonsFile: entry.file ?? 'File:REPLACE ME.jpg' } }, null, 2)
          .split('\n')
          .slice(1, -1)
          .join('\n'),
      );
      return `<figure class="card ${status}">
  ${has ? `<img loading="lazy" src="../artworks/${esc(job.id)}/source.jpg" alt="">` : '<div class="missing">no scan — stand-in</div>'}
  <figcaption>
    <b>${esc(job.artist)}</b><br><i>${esc(job.title)}</i>, ${esc(job.year)}<br>
    <span class="dim">${esc(job.dimensions)}</span><br>
    <span class="tag ${status}">${status}</span>
    <span class="dim">${esc(out?.how ?? entry.error ?? '')}</span><br>
    ${entry.url ? `<a href="${esc(entry.url)}" target="_blank" rel="noreferrer">${esc(entry.file ?? '')}</a>` : `<span class="dim">${esc(entry.file ?? '')}</span>`}
    <details><summary>pin this</summary><pre>${pinLine}</pre></details>
  </figcaption>
</figure>`;
    })
    .join('\n');

  const html = `<!doctype html><meta charset="utf-8"><title>Placard — what got fetched</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 13px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; background: #14120f; color: #eae4d8; }
  h1 { font-weight: 500; font-size: 20px; }
  p.lead { max-width: 62ch; color: #b3aa99; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .card { margin: 0; background: #1e1b16; border: 1px solid #2e2a22; border-radius: 6px; padding: 10px; }
  .card.failed { border-color: #7a3b2e; }
  img { width: 100%; height: 210px; object-fit: contain; background: #0b0a08; border-radius: 3px; }
  .missing { height: 210px; display: grid; place-items: center; background: #0b0a08; color: #6d6557; border-radius: 3px; }
  figcaption { margin-top: 8px; word-break: break-word; }
  .dim { color: #8e8577; }
  .tag { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 1px 6px; border-radius: 3px; background: #2e2a22; }
  .tag.fetched { background: #2c4030; } .tag.failed { background: #4a2b22; } .tag.skipped { background: #2a2a34; }
  a { color: #cbb789; }
  pre { white-space: pre-wrap; background: #0b0a08; padding: 6px; border-radius: 3px; font-size: 11px; }
</style>
<h1>What got fetched — ${jobs.length} works</h1>
<p class="lead">Look down the grid. Anything that is not the painting itself — a photograph of it in
its frame, a gallery wall with people in front of it, an engraving after it, or plainly the wrong
work — should be pinned by hand. Open its Commons link, copy the exact file name, and paste the
<b>pin this</b> block into <code>data/image-sources.json</code>. Then re-run
<code>pnpm fetch:images --only &lt;id&gt;</code>; changing a pin invalidates the old scan on its own.</p>
<div class="grid">
${cards}
</div>`;
  fs.writeFileSync(path.join(CACHE, 'contact-sheet.html'), html);
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
