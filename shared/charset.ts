/**
 * The glyph charset, shared between the build pipeline and the runtime.
 *
 * Corpus binaries store *indices into this string* (spec §5.2) — not
 * codepoints — so the order here is a binary-format contract. Appending is
 * safe; reordering requires regenerating every corpus.bin.
 *
 * ASCII printable (spaces are stripped at corpus build, §4.4) plus the
 * Latin-1 letters and typographic marks that art-history text is full of.
 */

const ASCII =
  '!"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~';

const LATIN =
  'ÀÂÄÇÈÉÊËÎÏÔÖÙÛÜàâäæçèéêëîïôöùûüÿœŒÆ' +
  'áéíóúñÑ' +
  '’‘“”—–·°«»';

export const CHARSET: string = ASCII + LATIN;

if (CHARSET.length > 255) {
  throw new Error(`charset too large for uint8 indices: ${CHARSET.length}`);
}

/** char → index lookup */
export const CHAR_INDEX: ReadonlyMap<string, number> = new Map(
  [...CHARSET].map((c, i) => [c, i]),
);

/**
 * Best-effort fold of out-of-charset characters to a near ASCII equivalent
 * (spec §5.2 step 4). Returns -1 when the character should be dropped.
 */
export function foldToCharset(ch: string): number {
  const direct = CHAR_INDEX.get(ch);
  if (direct !== undefined) return direct;
  // strip combining marks: é → e etc.
  const folded = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const f = CHAR_INDEX.get(folded);
  if (f !== undefined) return f;
  const MAP: Record<string, string> = {
    '‘': "'", '’': "'", '“': '"', '”': '"',
    '–': '-', '—': '-', '…': '.', ' ': '',
    ß: 'ss', ø: 'o', Ø: 'O', å: 'a', Å: 'A', ð: 'd', þ: 'p',
  };
  const m = MAP[ch];
  if (m !== undefined && m.length === 1) return CHAR_INDEX.get(m) ?? -1;
  return -1;
}
