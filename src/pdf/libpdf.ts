import { PDF, rgb } from '@libpdf/core';
import { A4, type Canvas, type FontBytes, type RGB } from './canvas.ts';

/** LibPDF behind the small Canvas interface the layout uses. */
export function createLibPdfCanvas(bytes: FontBytes): Canvas {
  const pdf = PDF.create();
  pdf.setTitle('Rent receipts');
  // Creator and Producer stay at LibPDF's defaults: no web address in the file, as on the page.
  const fonts = {
    regular: pdf.embedFont(bytes.regular),
    semibold: pdf.embedFont(bytes.semibold),
    bold: pdf.embedFont(bytes.bold),
  };
  let page = pdf.addPage({ size: 'a4' });
  const H = A4.height;
  const col = (c: RGB) => rgb(c[0], c[1], c[2]);

  return {
    pageWidth: A4.width,
    pageHeight: A4.height,
    addPage() {
      page = pdf.addPage({ size: 'a4' });
    },
    width: (text, font, size) => fonts[font].widthOfTextAtSize(text, size),
    text(text, x, baseline, font, size, color) {
      page.drawText(text, { x, y: H - baseline, font: fonts[font], size, color: col(color) });
    },
    line(x1, y1, x2, y2, o) {
      page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: o.thickness, color: col(o.color), dashArray: o.dash });
    },
    rect(x, y, w, h, o) {
      page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderColor: col(o.color), borderWidth: o.thickness, borderDashArray: o.dash });
    },
    save: () => pdf.save({ subsetFonts: true }),
  };
}
