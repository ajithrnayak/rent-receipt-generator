// Browser check: each library is loaded only when its button is pressed, so the
// build shows one chunk per library. Fonts come from the same origin.
import type { CanvasFactory, FontBytes } from './canvas.ts';
import { renderReceipts } from './layout.ts';
import { sampleYear } from './sample.ts';
import regularUrl from '../fonts/source/Inter-Regular.ttf?url';
import semiboldUrl from '../fonts/source/Inter-SemiBold.ttf?url';
import boldUrl from '../fonts/source/Inter-Bold.ttf?url';

const loaders: Record<string, () => Promise<CanvasFactory>> = {
  libpdf: () => import('./adapters/libpdf.ts').then((m) => m.createLibPdf),
  jspdf: () => import('./adapters/jspdf.ts').then((m) => m.createJsPdf),
  pdflib: () => import('./adapters/pdflib.ts').then((m) => m.createPdfLib),
};

async function bytes(url: string) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

const out = document.querySelector('output')!;

// ?auto=libpdf makes the PDF on load and writes the result (and the first bytes) into the page, for headless checks.
const auto = new URLSearchParams(location.search).get('auto');
if (auto && loaders[auto]) {
  (async () => {
    try {
      const fonts: FontBytes = { regular: await bytes(regularUrl), semibold: await bytes(semiboldUrl), bold: await bytes(boldUrl) };
      const pdf = await renderReceipts(await (await loaders[auto]!())(fonts), sampleYear());
      out.textContent = `AUTO-OK ${auto} ${pdf.length} bytes, starts ${new TextDecoder().decode(pdf.subarray(0, 8))}`;
    } catch (err) {
      out.textContent = `AUTO-FAIL ${auto} ${(err as Error).stack}`;
    }
  })();
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-lib]')) {
  button.addEventListener('click', async () => {
    const name = button.dataset.lib!;
    out.textContent = `Making ${name}…`;
    const t0 = performance.now();
    const fonts: FontBytes = { regular: await bytes(regularUrl), semibold: await bytes(semiboldUrl), bold: await bytes(boldUrl) };
    const make = await loaders[name]!();
    const pdf = await renderReceipts(await make(fonts), sampleYear());
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rent-receipts-${name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    out.textContent = `${name}: ${(pdf.length / 1024).toFixed(1)} KB in ${(performance.now() - t0).toFixed(0)} ms`;
  });
}
