// The advice a stay's card gives: pure rules, so they can be tested without a browser.
import { unprintable } from './charset.ts';
import { formatINR } from './money.ts';
import { MONTH_NAMES, fyLabel, monthIndexOf, receiptDateOf, shortLabel, spanTitle, type Month } from './months.ts';
import {
  PAN_PATTERN, PAN_THRESHOLD, STAMP_THRESHOLD, firstOverlap, futureMonths, panNeeded, periodsOf, type PayMode, type Stay,
} from './receipts.ts';

export type Note = { text: string; kind: 'warn' | 'info' };

/**
 * What stops a typed blank from printing: left empty, or holding characters the PDF
 * fonts lack. The form and the Generate check both use this, so they always agree.
 */
export function problemOf(value: string): 'blank' | 'english' | null {
  if (!value.trim()) return 'blank';
  return unprintable(value).length ? 'english' : null;
}

/** The biggest single receipt this stay makes (a quarter is up to three months of rent). */
export function largestReceipt(stay: Stay): number {
  if (!stay.rent) return 0;
  return Math.max(0, ...periodsOf(stay).map((p) => (p.till - p.from + 1) * stay.rent!));
}

export function stampAdvice(mode: PayMode | null, largest: number): string {
  if (!mode) return 'Pick one; it prints on the receipts.';
  if (largest > 0 && largest <= STAMP_THRESHOLD) return 'Receipts of ₹5,000 or less don’t need a revenue stamp. The owner’s signature still helps if your employer asks.';
  if (mode === 'cash') return 'Cash rent over ₹5,000: put a ₹1 revenue stamp on each receipt and have the owner sign across it.';
  const how = mode === 'cheque' ? 'cheque' : 'bank transfer or UPI';
  return `Paid by ${how}: the Stamp Act still asks for a ₹1 stamp on receipts over ₹5,000, but many employers accept your bank statement instead. Check with yours.`;
}

export interface NoteContext {
  stays: Stay[];
  index: number;
  tenant: string;
  /** Generate has been pressed at least once. */
  tried: boolean;
  /** The current month. */
  now: Month;
  totals: Map<Month, number>;
  /** The page-wide PAN note shows on one stay only: the first that needs it. */
  showPanNote: boolean;
}

/** The notes under one stay's card, in the order they show. */
export function notesFor({ stays, index, tenant, tried, now, totals, showPanNote }: NoteContext): Note[] {
  const stay = stays[index]!;
  const multi = stays.length > 1;
  const notes: Note[] = [];

  if (stay.till < stay.from) {
    notes.push({ kind: 'warn', text: 'The end month is before the start month, so this stay has no receipts yet.' });
  } else {
    const overlap = firstOverlap(stays, index);
    if (overlap) notes.push({ kind: 'warn', text: `${shortLabel(overlap.month)} also appears in Stay ${overlap.other + 1}. That’s fine if you paid two rents that month; otherwise adjust the months.` });
    const future = futureMonths(stay, now);
    if (future.length) {
      const first = shortLabel(future[0]!);
      const span = future.length > 1 ? `${first} – ${shortLabel(future[future.length - 1]!)} haven’t` : `${first} hasn’t`;
      notes.push({ kind: 'warn', text: `${span} happened yet. Receipts are for rent you’ve already paid, so you may want to end at ${shortLabel(now)}.` });
    } else {
      // The receipt covering this month is dated after today (the 1st of next month).
      const current = periodsOf(stay).find((p) => p.from <= now && now <= p.till);
      if (current) {
        const which = current.from === current.till ? `${MONTH_NAMES[monthIndexOf(current.from)]}’s receipt` : `The ${spanTitle(current.from, current.till)} receipt`;
        notes.push({ kind: 'warn', text: `${which} will be dated ${receiptDateOf(current.till)}. Make it once you’ve paid, or end this stay at ${shortLabel(current.from - 1)}.` });
      }
    }
  }

  if (showPanNote) {
    const pan = panNeeded(stays, stay, totals);
    const where = multi ? 'Rent across your stays' : 'Rent';
    notes.push({ kind: 'info', text: `${where} comes to ₹${formatINR(pan.total)} in the ${fyLabel(pan.fy!)} financial year, above ₹${formatINR(PAN_THRESHOLD)}, so your employer will ask for the owner’s PAN${multi ? ' on every stay marked “Needed”' : ''}. Owner has no PAN? Ask your employer what they accept instead.` });
  }

  if (stay.pan && !PAN_PATTERN.test(stay.pan) && (stay.pan.length === 10 || tried)) {
    notes.push({ kind: 'warn', text: 'That PAN doesn’t look right: it’s 5 letters, 4 digits, then a letter.' });
  }

  const odd = unprintable([index === 0 ? tenant : '', stay.address, stay.owner].join(''));
  if (odd.length) {
    notes.push({ kind: 'warn', text: `The PDF can only print English letters for now, so ${odd.slice(0, 5).map((c) => `“${c}”`).join(' ')} won’t show. Please type names and the address in English.` });
  }

  return notes;
}
