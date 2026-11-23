// Renders one real receipt with the app's own PDF code, then (on macOS, with sips)
// turns it into public/sample-receipt.png for the "Sample receipt" dialog
// (titled "Rent receipt format"). Run: npm run sample
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMonth } from '../src/lib/months.ts';
import { buildReceipts, type Stay } from '../src/lib/receipts.ts';
import { renderReceipts } from '../src/pdf/layout.ts';
import { A4 } from '../src/pdf/canvas.ts';
import { createPdfCanvas } from '../src/pdf/writer.ts';

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

// The app's PDF writer, on a page one receipt tall (half of A4), so the image needs no cropping.
const canvas = createPdfCanvas({ regular: font('Regular'), semibold: font('SemiBold'), bold: font('Bold') }, { width: A4.width, height: A4.height / 2 });
const pdf = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay]));

const dir = mkdtempSync(join(tmpdir(), 'sample-receipt-'));
const pdfPath = join(dir, 'sample.pdf');
writeFileSync(pdfPath, pdf);

const out = fileURLToPath(new URL('public/sample-receipt.png', root));
execFileSync('sips', ['-s', 'format', 'png', '--resampleWidth', '1240', pdfPath, '--out', out], { stdio: 'ignore' });
console.log('public/sample-receipt.png written');
