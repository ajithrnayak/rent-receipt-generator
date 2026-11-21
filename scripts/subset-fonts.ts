// Subsets Inter (fonts/source/) to the printable character set:
// - TTF for the PDF  → src/assets/fonts/pdf/  (bundled into the PDF code)
// - WOFF2 for the page → public/fonts/
// Run after changing src/lib/charset.ts: `npm run fonts`.
import { readFileSync, writeFileSync } from 'node:fs';
import subsetFont from 'subset-font';
import { PRINTABLE_TEXT } from '../src/lib/charset.ts';

const root = new URL('..', import.meta.url);
const src = (name: string) => readFileSync(new URL(`fonts/source/${name}`, root));
const out = (path: string, data: Buffer) => {
  writeFileSync(new URL(path, root), data);
  console.log(`${path.padEnd(42)} ${(data.length / 1024).toFixed(1).padStart(6)} KB`);
};

const pdf = { Regular: 'Inter-Regular.ttf', SemiBold: 'Inter-SemiBold.ttf', Bold: 'Inter-Bold.ttf' };
for (const [weight, file] of Object.entries(pdf)) {
  out(`src/assets/fonts/pdf/Inter-${weight}.ttf`, await subsetFont(src(file), PRINTABLE_TEXT, {
    targetFormat: 'truetype',
    // The PDF libraries place glyphs one by one and never read OpenType layout or hinting.
    noHinting: true,
    dropTables: ['GSUB', 'GPOS', 'GDEF', 'STAT'],
  }));
}

const web = { 400: 'Inter-Regular.ttf', 500: 'Inter-Medium.ttf', 600: 'Inter-SemiBold.ttf', 700: 'Inter-Bold.ttf' };
for (const [weight, file] of Object.entries(web)) {
  out(`public/fonts/inter-${weight}.woff2`, await subsetFont(src(file), PRINTABLE_TEXT, { targetFormat: 'woff2' }));
}
