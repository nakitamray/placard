/**
 * build-corpus.ts
 *
 * Cleans and concatenates the texts an artwork is made of, folds every
 * character into the atlas charset, strips ALL whitespace ( spaces
 * would read as luminance holes) and emits:
 *
 *   public/artworks/{id}/corpus.bin — Uint8 charset INDICES (not codepoints)
 *   segment offset table — merged into meta.json by build-all
 *
 * Where the text comes from:
 *   1. data/artworks/{id}/sources.json + corpus/*.txt — real historical
 *      documents (letters, treatises, published criticism), which is what the
 *      exhibition is really for;
 *   2. otherwise the record's own placard: its wall label and extended note.
 *
 * (2) is not a fallback so much as the premise stated at its smallest — the
 * painting is reconstructed out of the text written about it either way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { artworkData, artworkPublic } from './lib/paths.ts';
import { foldToCharset } from '../shared/charset.ts';
import type { ArtworkRecord } from './lib/records.ts';

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

/** Reads the on-disk manifest if there is one, else builds one from the record. */
function resolveSources(record: ArtworkRecord): {
  manifest: SourcesManifest;
  text: Map<string, string>;
} {
  const dir = artworkData(record.id);
  const manifestPath = path.join(dir, 'sources.json');

  if (fs.existsSync(manifestPath)) {
    const manifest: SourcesManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const text = new Map<string, string>();
    for (const src of manifest.sources) {
      text.set(src.id, fs.readFileSync(path.join(dir, src.file), 'utf8'));
    }
    return { manifest, text };
  }

  const manifest: SourcesManifest = {
    segments: [
      { sourceId: 'placard-label', weight: 0.3 },
      { sourceId: 'placard-note', weight: 0.7 },
    ],
    sources: [
      {
        id: 'placard-label',
        file: '(record: labelText)',
        title: `Wall label for ${record.title}`,
        url: '',
        license: 'CC0',
        attribution: 'Placard',
      },
      {
        id: 'placard-note',
        file: '(record: extendedNote)',
        title: `Extended note on ${record.title}`,
        url: '',
        license: 'CC0',
        attribution: 'Placard',
      },
    ],
  };
  const text = new Map<string, string>([
    ['placard-label', record.labelText],
    ['placard-note', record.extendedNote],
  ]);
  return { manifest, text };
}

export function buildCorpus(record: ArtworkRecord): CorpusResult {
  const { manifest, text } = resolveSources(record);

  const indices: number[] = [];
  const segments: CorpusResult['segments'] = [];

  for (const seg of manifest.segments) {
    const raw = text.get(seg.sourceId);
    if (raw === undefined) throw new Error(`${record.id}: unknown sourceId ${seg.sourceId}`);
    const cleaned = cleanText(raw);
    const offset = indices.length;
    for (const ch of cleaned) {
      if (/\s/.test(ch)) continue; // remove ALL whitespace
      const idx = foldToCharset(ch);
      if (idx >= 0) indices.push(idx);
    }
    segments.push({ sourceId: seg.sourceId, offset, length: indices.length - offset });
  }

  if (indices.length === 0) throw new Error(`${record.id}: empty corpus`);

  const outDir = artworkPublic(record.id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'corpus.bin'), Buffer.from(Uint8Array.from(indices)));

  console.log(`  corpus.bin ${indices.length} chars, ${segments.length} segments`);
  return { length: indices.length, segments, sources: manifest.sources };
}
