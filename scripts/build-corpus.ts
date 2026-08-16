/**
 * build-corpus.ts — spec §5.2
 *
 * Reads data/artworks/{id}/sources.json, cleans and concatenates the segment
 * texts, folds every character into the atlas charset, strips ALL whitespace
 * (spec §4.4 — spaces would read as luminance holes), and emits:
 *
 *   public/artworks/{id}/corpus.bin — Uint8 charset INDICES (not codepoints)
 *   segment offset table — merged into meta.json by build-all
 *
 * Sources are local files under data/artworks/{id}/corpus/ (this environment
 * has no outbound web access; remote fetching would cache to data/.cache/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA, artworkData, artworkPublic } from './lib/paths.ts';
import { foldToCharset } from '../shared/charset.ts';

interface SourceEntry {
  id: string;
  file: string;
  title: string;
  url: string;
  license: string;
  attribution: string;
}

interface SourcesManifest {
  segments: Array<{ sourceId: string; weight: number }>;
  sources: SourceEntry[];
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '') // HTML tags
    .replace(/\{\{[^}]*\}\}/g, '') // wiki templates
    .replace(/\[\d+\]/g, '') // footnote markers
    .normalize('NFC');
}

export interface CorpusResult {
  length: number;
  segments: Array<{ sourceId: string; offset: number; length: number }>;
  sources: SourceEntry[];
}

export function buildCorpus(id: string): CorpusResult {
  const dir = artworkData(id);
  const manifest: SourcesManifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'sources.json'), 'utf8'),
  );
  const byId = new Map(manifest.sources.map((s) => [s.id, s]));

  const indices: number[] = [];
  const segments: CorpusResult['segments'] = [];

  for (const seg of manifest.segments) {
    const src = byId.get(seg.sourceId);
    if (!src) throw new Error(`${id}: unknown sourceId ${seg.sourceId}`);
    const raw = fs.readFileSync(path.join(dir, src.file), 'utf8');
    const cleaned = cleanText(raw);
    const offset = indices.length;
    for (const ch of cleaned) {
      if (/\s/.test(ch)) continue; // remove ALL whitespace (spec §5.2 step 5)
      const idx = foldToCharset(ch);
      if (idx >= 0) indices.push(idx);
    }
    segments.push({ sourceId: seg.sourceId, offset, length: indices.length - offset });
  }

  if (indices.length === 0) throw new Error(`${id}: empty corpus`);

  const outDir = artworkPublic(id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'corpus.bin'), Buffer.from(Uint8Array.from(indices)));

  console.log(`  corpus.bin  ${indices.length} chars, ${segments.length} segments`);
  return { length: indices.length, segments, sources: manifest.sources };
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const order: string[] = JSON.parse(
    fs.readFileSync(path.join(DATA, 'artworks', 'order.json'), 'utf8'),
  );
  for (const id of order) {
    console.log(id);
    buildCorpus(id);
  }
}
