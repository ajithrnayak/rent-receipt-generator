import { A4, hex, type Canvas, type FontKey } from './canvas.ts';
import type { Receipt } from '../lib/receipts.ts';
import { FIXED, wordingOf, type Run } from '../lib/wording.ts';

export { receiptText } from '../lib/wording.ts';

// Colours: every text colour is 4.5:1 or better on white.
const INK = hex('#14171C');
const BODY = hex('#374151');
const MUTED = hex('#4B5563');
const RULE = hex('#D1D5DB');
const CUT = hex('#7C8594');

const MARGIN_X = 56;
const HALF = A4.height / 2;

interface Piece {
  text: string;
  font: FontKey;
  x: number;
}

/** Greedy word wrap over runs of mixed fonts; a word wider than the line is broken by characters. */
export function wrap(c: Pick<Canvas, 'width'>, runs: Run[], size: number, maxWidth: number): Piece[][] {
  const lines: Piece[][] = [[]];
  let x = 0;
  const newLine = () => {
    lines.push([]);
    x = 0;
  };
  for (const run of runs) {
    for (let word of run.text.match(/\S+\s*|\s+/g) ?? []) {
      if (!word.trim() && x === 0) continue; // no leading spaces on a line
      let trimmed = c.width(word.trimEnd(), run.font, size);
      if (x > 0 && x + trimmed > maxWidth) {
        newLine();
        if (!word.trim()) continue;
      }
      // A single word longer than a whole line: split it.
      while (trimmed > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && c.width(word.slice(0, cut), run.font, size) > maxWidth) cut--;
        lines[lines.length - 1]!.push({ text: word.slice(0, cut), font: run.font, x });
        newLine();
        word = word.slice(cut);
        trimmed = c.width(word.trimEnd(), run.font, size);
      }
      lines[lines.length - 1]!.push({ text: word, font: run.font, x });
      x += c.width(word, run.font, size);
    }
  }
  return lines.filter((l) => l.length > 0);
}

function rightText(c: Canvas, text: string, right: number, baseline: number, font: FontKey, size: number) {
  c.text(text, right - c.width(text, font, size), baseline, font, size, MUTED);
}

/** One receipt in the half page starting at `top`. */
function drawReceipt(c: Canvas, r: Receipt, top: number) {
  const w = wordingOf(r);
  const left = MARGIN_X;
  const right = A4.width - MARGIN_X;
  const width = right - left;
  let y = top + 44;

  c.text(FIXED.kicker, left, y, 'semibold', 10, INK);
  rightText(c, w.no, right, y, 'regular', 10);

  y += 30;
  const date = w.date;
  const dateWidth = c.width(date, 'regular', 11);
  const title = w.title;
  let titleSize = 22;
  while (titleSize > 14 && c.width(title, 'bold', titleSize) > width - dateWidth - 24) titleSize -= 1;
  c.text(title, left, y, 'bold', titleSize, INK);
  rightText(c, date, right, y, 'regular', 11);

  y += 14;
  c.line(left, y, right, y, { thickness: 0.75, color: RULE });

  const size = 12;
  const lead = 19;
  y += 28;
  for (const line of wrap(c, w.sentence, size, width)) {
    for (const piece of line) c.text(piece.text, left + piece.x, y, piece.font, size, BODY);
    y += lead;
  }

  y += 10;
  for (const [label, value] of w.rows) {
    c.text(label, left, y, 'regular', 10, MUTED);
    // Long owner names wrap within the value column.
    const lines = wrap(c, [{ text: value, font: 'semibold' }], 12, width - 110);
    for (const [i, line] of lines.entries()) {
      for (const piece of line) c.text(piece.text, left + 110 + piece.x, y + i * 16, piece.font, 12, INK);
    }
    y += 21 + (lines.length - 1) * 16;
  }

  if (w.sign) {
    const box = 54;
    const boxX = right - box;
    const boxTop = top + HALF - 48 - box - 16;
    c.rect(boxX, boxTop, box, box, { thickness: 0.75, color: CUT, dash: [3, 2] });
    const stamp = FIXED.stamp;
    c.text(stamp, boxX + (box - c.width(stamp, 'regular', 9)) / 2, boxTop + box / 2 + 3, 'regular', 9, MUTED);
    rightText(c, FIXED.stampCaption, right, boxTop + box + 14, 'regular', 9);

    const sigRight = boxX - 24;
    const sigLeft = sigRight - 190;
    const sigY = boxTop + box;
    c.line(sigLeft, sigY, sigRight, sigY, { thickness: 0.75, color: INK });
    c.text(FIXED.signature, sigLeft, sigY + 14, 'regular', 9, MUTED);
  }
}

/** Two receipts per A4 page and a dashed cut line between them. Nothing else on the page: no credit, logo or link. */
export async function renderReceipts(c: Canvas, receipts: Receipt[]): Promise<Uint8Array> {
  receipts.forEach((r, i) => {
    const slot = i % 2;
    if (slot === 0) {
      if (i > 0) c.addPage();
      if (i < receipts.length - 1) c.line(24, HALF, A4.width - 24, HALF, { thickness: 0.5, color: CUT, dash: [4, 4] });
    }
    drawReceipt(c, r, slot * HALF);
  });
  return c.save();
}
