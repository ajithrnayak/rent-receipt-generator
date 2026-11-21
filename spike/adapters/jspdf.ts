import { jsPDF } from 'jspdf';
import { A4, type Canvas, type CanvasFactory, type FontKey } from '../canvas.ts';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// jsPDF registers custom fonts by family + style; one family per weight keeps it simple.
const FAMILY: Record<FontKey, string> = { regular: 'Inter', semibold: 'InterSemiBold', bold: 'InterBold' };

export const createJsPdf: CanvasFactory = async (bytes) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({ title: 'Rent receipts', creator: 'rent-receipt-generator.ajith.xyz' });
  for (const key of Object.keys(FAMILY) as FontKey[]) {
    const file = `${FAMILY[key]}.ttf`;
    doc.addFileToVFS(file, toBase64(bytes[key]));
    doc.addFont(file, FAMILY[key], 'normal');
  }
  const use = (font: FontKey, size: number) => {
    doc.setFont(FAMILY[font], 'normal');
    doc.setFontSize(size);
  };

  const canvas: Canvas = {
    pageWidth: A4.width,
    pageHeight: A4.height,
    addPage() {
      doc.addPage('a4');
    },
    width(text, font, size) {
      use(font, size);
      return doc.getTextWidth(text);
    },
    text(text, x, baseline, font, size, color) {
      use(font, size);
      doc.setTextColor(color[0] * 255, color[1] * 255, color[2] * 255);
      doc.text(text, x, baseline, { baseline: 'alphabetic' });
    },
    line(x1, y1, x2, y2, o) {
      doc.setLineWidth(o.thickness);
      doc.setDrawColor(o.color[0] * 255, o.color[1] * 255, o.color[2] * 255);
      doc.setLineDashPattern(o.dash ?? [], 0);
      doc.line(x1, y1, x2, y2);
    },
    rect(x, y, w, h, o) {
      doc.setLineWidth(o.thickness);
      doc.setDrawColor(o.color[0] * 255, o.color[1] * 255, o.color[2] * 255);
      doc.setLineDashPattern(o.dash ?? [], 0);
      doc.rect(x, y, w, h, 'S');
    },
    save: async () => new Uint8Array(doc.output('arraybuffer')),
  };
  return canvas;
};
