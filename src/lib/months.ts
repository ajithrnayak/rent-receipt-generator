/**
 * Months are counted as a single integer: year * 12 + monthIndex (0 = January).
 * That keeps ranges, sorting and "next month" as plain arithmetic, and avoids
 * time zones entirely: nothing here builds a local Date.
 */
export type Month = number;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function toMonth(year: number, monthIndex: number): Month {
  return year * 12 + monthIndex;
}

export function yearOf(m: Month): number {
  return Math.floor(m / 12);
}

export function monthIndexOf(m: Month): number {
  return ((m % 12) + 12) % 12;
}

/** "September 2026" */
export function longLabel(m: Month): string {
  return `${MONTH_NAMES[monthIndexOf(m)]} ${yearOf(m)}`;
}

/** "Sep 2026" */
export function shortLabel(m: Month): string {
  return `${MONTH_SHORT[monthIndexOf(m)]} ${yearOf(m)}`;
}

/** Number of days in the month, leap years included. */
export function daysIn(m: Month): number {
  return new Date(Date.UTC(yearOf(m), monthIndexOf(m) + 1, 0)).getUTCDate();
}

/** "1 September 2026" style date for a day in a month. */
export function dayLabel(day: number, m: Month): string {
  return `${day} ${longLabel(m)}`;
}

/** The exact period a receipt covers: the 1st to the real last day. */
export function periodOf(m: Month): { from: string; to: string } {
  return { from: dayLabel(1, m), to: dayLabel(daysIn(m), m) };
}

/**
 * The date printed on a receipt for a period ending in month `till`: the 1st
 * of the following month, except when the period ends in March, which is
 * dated 31 March so the receipt stays inside the financial year.
 */
export function receiptDateOf(till: Month): string {
  if (monthIndexOf(till) === 2) return dayLabel(31, till);
  return dayLabel(1, till + 1);
}

/** The exact period from the 1st of `from` to the last day of `till`. */
export function spanOf(from: Month, till: Month): { from: string; to: string } {
  return { from: dayLabel(1, from), to: dayLabel(daysIn(till), till) };
}

/** "September 2026", or "April – June 2026" for a span within one year, else "November 2026 – February 2027". */
export function spanTitle(from: Month, till: Month): string {
  if (from === till) return longLabel(from);
  if (yearOf(from) === yearOf(till)) return `${MONTH_NAMES[monthIndexOf(from)]} – ${longLabel(till)}`;
  return `${longLabel(from)} – ${longLabel(till)}`;
}

/** First month of the financial-year quarter holding `m` (Apr, Jul, Oct or Jan). */
export function quarterStartOf(m: Month): Month {
  const fy = fyStartOf(m);
  return fy + Math.floor((m - fy) / 3) * 3;
}

/** April of the financial year that contains this month. */
export function fyStartOf(m: Month): Month {
  return monthIndexOf(m) >= 3 ? toMonth(yearOf(m), 3) : toMonth(yearOf(m) - 1, 3);
}

/** "2026-27" */
export function fyLabel(m: Month): string {
  const start = yearOf(fyStartOf(m));
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Inclusive range of months; empty if till is before from. */
export function monthsBetween(from: Month, till: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= till; m++) out.push(m);
  return out;
}
