import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { A4, type Canvas, type CanvasFactory, type FontKey, type RGB } from '../canvas.ts';

export const createPdfLib: CanvasFactory = async (bytes) => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle('Rent receipts');
  doc.setCreator('rent-receipt-generator.ajith.xyz');
  const fonts: Record<FontKey, PDFFont> = {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    semibold: await doc.embedFont(bytes.semibold, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
  };
  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  const H = A4.height;
  const col = (c: RGB) => rgb(c[0], c[1], c[2]);

  const canvas: Canvas = {
    pageWidth: A4.width,
    pageHeight: A4.height,
    addPage() {
      page = doc.addPage([A4.width, A4.height]);
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
    save: () => doc.save(),
  };
  return canvas;
};
