import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA = path.join(ROOT, 'data');
export const PUBLIC = path.join(ROOT, 'public');
/** build scratch — generated stand-in sources and glyph previews (gitignored) */
export const CACHE = path.join(DATA, '.cache');

export const museumData = (id: string) => path.join(DATA, 'museums', `${id}.json`);
export const collectionData = (id: string) => path.join(DATA, 'collections', `${id}.json`);

/** optional per-artwork overrides: source.jpg, corpus/, sources.json, regions.json, config.json */
export const artworkData = (id: string) => path.join(DATA, 'artworks', id);
export const artworkPublic = (id: string) => path.join(PUBLIC, 'artworks', id);
export const museumPublic = (id: string) => path.join(PUBLIC, 'museums', `${id}.json`);
