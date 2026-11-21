/**
 * The characters the receipt fonts can print. The build subsets Inter to exactly
 * this set (scripts/subset-fonts.ts), and the form warns about anything outside it,
 * because a missing glyph prints as an empty box in the PDF with no error.
 */
const RANGES: [number, number][] = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xff], // Latin-1 Supplement (é, ü, ·, ×)
  [0x100, 0x17f], // Latin Extended-A (ā, ś, ł)
];

const EXTRAS = '–—‘’“”…•₹'; // – — ‘ ’ “ ” … • ₹

// Inside the ranges but not in Inter: the soft hyphen and the obsolete ŉ.
const MISSING_FROM_INTER = new Set([0xad, 0x149]);

export const PRINTABLE_TEXT: string = (() => {
  let s = '';
  for (const [from, to] of RANGES) {
    for (let c = from; c <= to; c++) if (!MISSING_FROM_INTER.has(c)) s += String.fromCodePoint(c);
  }
  return s + EXTRAS;
})();

const PRINTABLE = new Set(Array.from(PRINTABLE_TEXT));

/** Characters in `text` the PDF cannot print, deduplicated, in order of appearance. */
export function unprintable(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    if (ch === '\n' || PRINTABLE.has(ch) || out.includes(ch)) continue;
    out.push(ch);
  }
  return out;
}
