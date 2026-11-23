// What a receipt says, shared by the PDF and the on-page preview so they never differ.
import { amountInWords, formatINR } from './money.ts';
import { receiptDateOf, spanOf, spanTitle } from './months.ts';
import type { PayMode, Receipt } from './receipts.ts';

export type Weight = 'regular' | 'semibold' | 'bold';

export interface Run {
  text: string;
  font: Weight;
}

export const MODE_LABEL: Record<PayMode, string> = {
  bank: 'Bank transfer / UPI',
  cheque: 'Cheque',
  cash: 'Cash',
};

export const FIXED = {
  kicker: 'RENT RECEIPT',
  stamp: '₹1 stamp',
  stampCaption: 'Revenue stamp',
  signature: 'Owner’s signature',
} as const;

export interface Wording {
  no: string;
  title: string;
  date: string;
  sentence: Run[];
  rows: [string, string][];
  sign: boolean;
}

export function wordingOf(r: Receipt): Wording {
  const p = spanOf(r.from, r.till);
  const rows: [string, string][] = [['Received by', r.owner]];
  if (r.pan) rows.push(['Owner’s PAN', r.pan]);
  if (r.sign && r.mode) rows.push(['Mode of payment', MODE_LABEL[r.mode]]);
  return {
    no: `No. ${r.no}`,
    title: spanTitle(r.from, r.till),
    date: `Date: ${receiptDateOf(r.till)}`,
    sentence: [
      { text: 'Received from ', font: 'regular' },
      { text: r.tenant, font: 'semibold' },
      { text: ' the sum of ', font: 'regular' },
      { text: `₹${formatINR(r.amount)}`, font: 'semibold' },
      { text: ` (${amountInWords(r.amount)}) towards rent for the property at `, font: 'regular' },
      { text: r.address, font: 'regular' },
      { text: ', for the period ', font: 'regular' },
      { text: `${p.from} to ${p.to}`, font: 'semibold' },
      { text: '.', font: 'regular' },
    ],
    rows,
    sign: r.sign,
  };
}

/** Every piece of text printed for a receipt (for the charset test). */
export function receiptText(r: Receipt): string[] {
  const w = wordingOf(r);
  return [w.no, w.title, w.date, ...w.sentence.map((s) => s.text), ...w.rows.flat(), ...Object.values(FIXED)];
}
