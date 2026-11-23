import { fyStartOf, monthsBetween, quarterStartOf, type Month } from './months.ts';

export type PayMode = 'bank' | 'cheque' | 'cash';
export type Frequency = 'monthly' | 'quarterly';

/** One home, owner and rent: a card on the page. */
export interface Stay {
  id: number;
  /** Monthly rent in whole rupees; null while blank. */
  rent: number | null;
  address: string;
  owner: string;
  pan: string;
  from: Month;
  till: Month;
  frequency: Frequency;
  /** Signature line and stamp box on the receipts. */
  sign: boolean;
  mode: PayMode | null;
}

/** One receipt in the PDF. */
export interface Receipt {
  no: number;
  stayId: number;
  from: Month;
  till: Month;
  months: number;
  monthlyRent: number;
  amount: number;
  tenant: string;
  address: string;
  owner: string;
  pan: string;
  sign: boolean;
  /** Printed only when the signature boxes are on. */
  mode: PayMode | null;
}

export const PAN_THRESHOLD = 100_000;
export const STAMP_THRESHOLD = 5_000;

/** The periods a stay is split into: single months, or financial-year quarters cut to the stay. */
export function periodsOf(stay: Pick<Stay, 'from' | 'till' | 'frequency'>): { from: Month; till: Month }[] {
  if (stay.till < stay.from) return [];
  if (stay.frequency === 'monthly') return monthsBetween(stay.from, stay.till).map((m) => ({ from: m, till: m }));
  const out: { from: Month; till: Month }[] = [];
  for (let q = quarterStartOf(stay.from); q <= stay.till; q += 3) {
    out.push({ from: Math.max(q, stay.from), till: Math.min(q + 2, stay.till) });
  }
  return out;
}

/**
 * Every receipt from every stay, in strict date order (ties keep the stays' order),
 * numbered from 1 after sorting. Stays without rent are skipped.
 */
export function buildReceipts(tenant: string, stays: Stay[]): Receipt[] {
  const all: Omit<Receipt, 'no'>[] = [];
  for (const s of stays) {
    if (!s.rent) continue;
    for (const p of periodsOf(s)) {
      const months = p.till - p.from + 1;
      all.push({
        stayId: s.id,
        from: p.from,
        till: p.till,
        months,
        monthlyRent: s.rent,
        amount: s.rent * months,
        tenant: tenant.trim(),
        address: s.address.trim(),
        owner: s.owner.trim(),
        pan: s.pan,
        sign: s.sign,
        mode: s.sign ? s.mode : null,
      });
    }
  }
  // Array.prototype.sort is stable, so equal start months keep the stays' order.
  return all.sort((a, b) => a.from - b.from || a.till - b.till).map((r, i) => ({ ...r, no: i + 1 }));
}

/** First month this stay shares with an earlier or later stay, with that stay's position (0-based). */
export function firstOverlap(stays: Stay[], index: number): { month: Month; other: number } | null {
  const me = stays[index];
  if (!me || me.till < me.from) return null;
  for (let m = me.from; m <= me.till; m++) {
    const other = stays.findIndex((s, j) => j !== index && s.from <= m && m <= s.till);
    if (other >= 0) return { month: m, other };
  }
  return null;
}

/** Months of the stay after `now` (receipts are for rent already paid). */
export function futureMonths(stay: Stay, now: Month): Month[] {
  return stay.till < stay.from ? [] : monthsBetween(Math.max(stay.from, now + 1), stay.till);
}

/** Total rent per financial year (keyed by its April) across all stays, for the months they cover. */
export function rentByFinancialYear(stays: Stay[]): Map<Month, number> {
  const totals = new Map<Month, number>();
  for (const s of stays) {
    if (!s.rent || s.till < s.from) continue;
    for (const m of monthsBetween(s.from, s.till)) {
      const fy = fyStartOf(m);
      totals.set(fy, (totals.get(fy) ?? 0) + s.rent);
    }
  }
  return totals;
}

/**
 * Whether the owner's PAN is needed for this stay: total rent in any financial
 * year the stay touches, across all stays, is above ₹1,00,000. (Stricter reading:
 * the sources don't settle whether the limit is per landlord; see docs/rules.md.)
 */
export function panNeeded(
  stays: Stay[],
  stay: Stay,
  totals = rentByFinancialYear(stays),
): { needed: boolean; total: number; fy: Month | null } {
  let worst = 0;
  let worstFy: Month | null = null;
  if (stay.till >= stay.from) {
    for (let fy = fyStartOf(stay.from); fy <= stay.till; fy += 12) {
      const total = totals.get(fy) ?? 0;
      if (total > worst) {
        worst = total;
        worstFy = fy;
      }
    }
  }
  return { needed: worst > PAN_THRESHOLD, total: worst, fy: worstFy };
}

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Uppercase, letters and digits only, at most 10. */
export function cleanPan(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

/** Digits only, no leading zeros, at most 9 digits (under ₹100 crore a month). */
export function cleanRent(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 9);
  return digits ? Number(digits) : null;
}
