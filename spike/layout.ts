import { A4, hex, type Canvas, type FontKey } from './canvas.ts';
import { amountInWords, formatINR } from '../src/lib/money.ts';
import { longLabel, periodOf, receiptDateOf, type Month } from '../src/lib/months.ts';

export type PayMode = 'bank' | 'cheque' | 'cash';

export interface Receipt {
  no: number;
  month: Month;
  tenant: string;
  amount: number;
  address: string;
  owner: string;
  pan?: string;
  /** Signature line and stamp box; payment mode prints only when this is on. */
  sign: boolean;
  mode?: PayMode;
}

const INK = hex('#14171C');
const BODY = hex('#374151');
const MUTED = hex('#4B5563'); // 7.6:1 on white
const RULE = hex('#D1D5DB');
const CUT = hex('#7C8594');

const MARGIN_X = 56;
const HALF = A4.height / 2;

const MODE_LABEL: Record<PayMode, string> = {
  bank: 'Bank transfer / UPI',
  cheque: 'Cheque',
  cash: 'Cash',
};

interface Run {
  text: string;
  font: FontKey;
}

/** Greedy word wrap over runs of mixed fonts. Returns lines of positioned pieces. */
function wrap(c: Canvas, runs: Run[], size: number, maxWidth: number) {
  type Piece = { text: string; font: FontKey; x: number };
  const lines: Piece[][] = [[]];
  let x = 0;
  for (const run of runs) {
    // Keep the spaces attached to the word before them so widths add up.
    const words = run.text.match(/\S+\s*|\s+/g) ?? [];
    for (const word of words) {
      const w = c.width(word, run.font, size);
      const trimmed = c.width(word.trimEnd(), run.font, size);
      if (x > 0 && x + trimmed > maxWidth) {
        lines.push([]);
        x = 0;
        if (!word.trim()) continue;
      }
      lines[lines.length - 1]!.push({ text: word, font: run.font, x });
      x += w;
    }
  }
  return lines;
}

function rightText(c: Canvas, text: string, right: number, baseline: number, font: FontKey, size: number, color = MUTED) {
  c.text(text, right - c.width(text, font, size), baseline, font, size, color);
}

/** One receipt in the half page starting at `top`. */
function drawReceipt(c: Canvas, r: Receipt, top: number) {
  const left = MARGIN_X;
  const right = A4.width - MARGIN_X;
  const width = right - left;
  let y = top + 44;

  c.text('RENT RECEIPT', left, y, 'semibold', 10, INK);
  rightText(c, `No. ${r.no}`, right, y, 'regular', 10);

  y += 30;
  c.text(longLabel(r.month), left, y, 'bold', 22, INK);
  rightText(c, `Date: ${receiptDateOf(r.month)}`, right, y, 'regular', 11);

  y += 14;
  c.line(left, y, right, y, { thickness: 0.75, color: RULE });

  const p = periodOf(r.month);
  const runs: Run[] = [
    { text: 'Received with thanks from ', font: 'regular' },
    { text: r.tenant, font: 'semibold' },
    { text: ' the sum of ', font: 'regular' },
    { text: `₹${formatINR(r.amount)}`, font: 'semibold' },
    { text: ` (${amountInWords(r.amount)}) towards rent for the house at `, font: 'regular' },
    { text: r.address, font: 'regular' },
    { text: ', for the period ', font: 'regular' },
    { text: `${p.from} to ${p.to}`, font: 'semibold' },
    { text: '.', font: 'regular' },
  ];
  const size = 12;
  const lead = 19;
  y += 28;
  for (const line of wrap(c, runs, size, width)) {
    for (const piece of line) c.text(piece.text, left + piece.x, y, piece.font, size, BODY);
    y += lead;
  }

  y += 10;
  const rows: [string, string][] = [['Received by', r.owner]];
  if (r.pan) rows.push(["Owner's PAN", r.pan]);
  if (r.sign && r.mode) rows.push(['Mode of payment', MODE_LABEL[r.mode]]);
  for (const [label, value] of rows) {
    c.text(label, left, y, 'regular', 10, MUTED);
    c.text(value, left + 110, y, 'semibold', 12, INK);
    y += 21;
  }

  if (r.sign) {
    const boxSize = 54;
    const boxX = right - boxSize;
    const boxTop = top + HALF - 48 - boxSize - 16;
    c.rect(boxX, boxTop, boxSize, boxSize, { thickness: 0.75, color: CUT, dash: [3, 2] });
    const stamp = '₹1 stamp';
    c.text(stamp, boxX + (boxSize - c.width(stamp, 'regular', 9)) / 2, boxTop + boxSize / 2 + 3, 'regular', 9, MUTED);
    rightText(c, 'Revenue stamp', right, boxTop + boxSize + 14, 'regular', 9);

    const sigRight = boxX - 24;
    const sigLeft = sigRight - 190;
    const sigY = boxTop + boxSize;
    c.line(sigLeft, sigY, sigRight, sigY, { thickness: 0.75, color: INK });
    c.text("Owner's signature", sigLeft, sigY + 14, 'regular', 9, MUTED);
  }
}

/** Two receipts per A4 page, a dashed cut line between them, one small credit per page. */
export async function renderReceipts(c: Canvas, receipts: Receipt[]): Promise<Uint8Array> {
  receipts.forEach((r, i) => {
    const slot = i % 2;
    if (slot === 0) {
      if (i > 0) c.addPage();
      const credit = 'Made by Ajith · ajith.xyz';
      c.text(credit, (A4.width - c.width(credit, 'regular', 8)) / 2, A4.height - 22, 'regular', 8, MUTED);
    }
    // Cut line only when the lower half of the page is used.
    if (slot === 0 && i < receipts.length - 1) {
      c.line(24, HALF, A4.width - 24, HALF, { thickness: 0.5, color: CUT, dash: [4, 4] });
    }
    drawReceipt(c, r, slot * HALF);
  });
  return c.save();
}
