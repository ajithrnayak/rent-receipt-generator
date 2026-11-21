// Writes the same 12 receipts with each library to spike/out/, and reports size and time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CanvasFactory, FontBytes } from './canvas.ts';
import { renderReceipts } from './layout.ts';
import { sampleYear } from './sample.ts';
import { createLibPdf } from './adapters/libpdf.ts';
import { createJsPdf } from './adapters/jspdf.ts';
import { createPdfLib } from './adapters/pdflib.ts';

const root = new URL('..', import.meta.url);
const font = (name: string) => new Uint8Array(readFileSync(new URL(`fonts/source/${name}`, root)));
const fonts: FontBytes = {
  regular: font('Inter-Regular.ttf'),
  semibold: font('Inter-SemiBold.ttf'),
  bold: font('Inter-Bold.ttf'),
};

const outDir = fileURLToPath(new URL('spike/out/', root));
mkdirSync(outDir, { recursive: true });

const libs: [string, CanvasFactory][] = [
  ['libpdf', createLibPdf],
  ['jspdf', createJsPdf],
  ['pdflib', createPdfLib],
];

const receipts = sampleYear();
for (const [name, make] of libs) {
  try {
    const t0 = performance.now();
    const bytes = await renderReceipts(await make(fonts), receipts);
    const ms = performance.now() - t0;
    writeFileSync(`${outDir}${name}.pdf`, bytes);
    // August and September on one page: the longest month name, and the stay with signature boxes.
    writeFileSync(`${outDir}${name}-aug-sep.pdf`, await renderReceipts(await make(fonts), receipts.slice(4, 6)));
    console.log(`${name.padEnd(8)} ${(bytes.length / 1024).toFixed(1).padStart(7)} KB  ${ms.toFixed(0).padStart(5)} ms`);
  } catch (err) {
    console.log(`${name.padEnd(8)} FAILED: ${(err as Error).stack}`);
  }
}
