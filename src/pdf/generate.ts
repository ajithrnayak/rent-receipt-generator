// Loaded only when someone presses Generate: LibPDF and the fonts live in this chunk.
// The fonts are bundled as data, not fetched, so the page can run with connect-src 'none'.
import regular from '../assets/fonts/pdf/Inter-Regular.ttf?inline';
import semibold from '../assets/fonts/pdf/Inter-SemiBold.ttf?inline';
import bold from '../assets/fonts/pdf/Inter-Bold.ttf?inline';
import type { Receipt } from '../lib/receipts.ts';
import { renderReceipts } from './layout.ts';
import { createLibPdfCanvas } from './libpdf.ts';

function fromDataUrl(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function makePdf(receipts: Receipt[]): Promise<Blob> {
  const canvas = createLibPdfCanvas({ regular: fromDataUrl(regular), semibold: fromDataUrl(semibold), bold: fromDataUrl(bold) });
  const bytes = await renderReceipts(canvas, receipts);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
