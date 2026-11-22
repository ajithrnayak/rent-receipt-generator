// Renders one real receipt with the app's own PDF code, then (on macOS, with sips)
// turns it into public/sample-receipt.png for the
// "Rent receipt format" section. Run: npm run sample
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMonth } from '../src/lib/months.ts';
import { buildReceipts, type Stay } from '../src/lib/receipts.ts';
import { renderReceipts } from '../src/pdf/layout.ts';
import { PDF, rgb } from '@libpdf/core';
import { A4, type Canvas, type RGB } from '../src/pdf/canvas.ts';

const root = new URL('..', import.meta.url);
const font = (w: string) => new Uint8Array(readFileSync(new URL(`src/assets/fonts/pdf/Inter-${w}.ttf`, root)));

const stay: Stay = {
  id: 1,
  rent: 28000,
  address: '14, 2nd Cross, Indiranagar, Bengaluru 560038',
  owner: 'K. S. Venkatesh',
  pan: 'ABCPV1234K',
  from: toMonth(2026, 3),
  till: toMonth(2026, 5),
  frequency: 'quarterly',
  sign: true,
  mode: 'cash',
};

// Like src/pdf/libpdf.ts, but the page is one receipt tall (half of A4), so the image needs no cropping.
const H = A4.height / 2;
const doc = PDF.create();
const fonts = { regular: doc.embedFont(font('Regular')), semibold: doc.embedFont(font('SemiBold')), bold: doc.embedFont(font('Bold')) };
const page = doc.addPage({ width: A4.width, height: H });
const col = (c: RGB) => rgb(c[0], c[1], c[2]);
const canvas: Canvas = {
  pageWidth: A4.width,
  pageHeight: H,
  addPage() {},
  width: (text, f, size) => fonts[f].widthOfTextAtSize(text, size),
  text: (text, x, baseline, f, size, color) => page.drawText(text, { x, y: H - baseline, font: fonts[f], size, color: col(color) }),
  line: (x1, y1, x2, y2, o) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: o.thickness, color: col(o.color), dashArray: o.dash }),
  rect: (x, y, w, h, o) => page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderColor: col(o.color), borderWidth: o.thickness, borderDashArray: o.dash }),
  save: () => doc.save({ subsetFonts: true }),
};
const pdf = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay]));

const dir = mkdtempSync(join(tmpdir(), 'sample-receipt-'));
const pdfPath = join(dir, 'sample.pdf');
writeFileSync(pdfPath, pdf);

const out = fileURLToPath(new URL('public/sample-receipt.png', root));
execFileSync('sips', ['-s', 'format', 'png', '--resampleWidth', '1240', pdfPath, '--out', out], { stdio: 'ignore' });
console.log('public/sample-receipt.png written');
