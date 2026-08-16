import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA = path.join(ROOT, 'data');
export const PUBLIC = path.join(ROOT, 'public');

export const artworkData = (id: string) => path.join(DATA, 'artworks', id);
export const artworkPublic = (id: string) => path.join(PUBLIC, 'artworks', id);
