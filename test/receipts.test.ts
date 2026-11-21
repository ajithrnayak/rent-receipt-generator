import { describe, expect, it } from 'vitest';
import { toMonth } from '../src/lib/months.ts';
import {
  buildReceipts, cleanPan, cleanRent, firstOverlap, futureMonths, panNeeded, periodsOf, type Stay,
} from '../src/lib/receipts.ts';

const m = (y: number, month1to12: number) => toMonth(y, month1to12 - 1);

function stay(id: number, from: number, till: number, extra: Partial<Stay> = {}): Stay {
  return { id, rent: 10000, address: `House ${id}`, owner: `Owner ${id}`, pan: '', from, till, frequency: 'monthly', sign: false, mode: null, ...extra };
}

describe('periods', () => {
  it('monthly: one per month', () => {
    expect(periodsOf({ from: m(2026, 4), till: m(2026, 6), frequency: 'monthly' })).toEqual([
      { from: m(2026, 4), till: m(2026, 4) },
      { from: m(2026, 5), till: m(2026, 5) },
      { from: m(2026, 6), till: m(2026, 6) },
    ]);
  });

  it('quarterly: financial-year quarters, cut to the stay', () => {
    expect(periodsOf({ from: m(2026, 5), till: m(2026, 10), frequency: 'quarterly' })).toEqual([
      { from: m(2026, 5), till: m(2026, 6) },
      { from: m(2026, 7), till: m(2026, 9) },
      { from: m(2026, 10), till: m(2026, 10) },
    ]);
  });

  it('quarterly across a financial-year boundary splits at March', () => {
    expect(periodsOf({ from: m(2027, 2), till: m(2027, 5), frequency: 'quarterly' })).toEqual([
      { from: m(2027, 2), till: m(2027, 3) },
      { from: m(2027, 4), till: m(2027, 5) },
    ]);
  });

  it('a full financial year is four quarters', () => {
    expect(periodsOf({ from: m(2026, 4), till: m(2027, 3), frequency: 'quarterly' })).toHaveLength(4);
  });

  it('end before start gives nothing', () => {
    expect(periodsOf({ from: m(2026, 6), till: m(2026, 4), frequency: 'monthly' })).toEqual([]);
  });
});

describe('receipt ordering', () => {
  it('strict date order across stays entered out of order, numbered after sorting', () => {
    // Stay 1 is the later home; stay 2 was added for the earlier months.
    const later = stay(1, m(2026, 9), m(2027, 3), { rent: 32500 });
    const earlier = stay(2, m(2026, 4), m(2026, 8), { rent: 28000 });
    const r = buildReceipts('Priya', [later, earlier]);
    expect(r.map((x) => x.from)).toEqual(Array.from({ length: 12 }, (_, i) => m(2026, 4) + i));
    expect(r.map((x) => x.no)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(r[0]!.stayId).toBe(2);
    expect(r[5]!.stayId).toBe(1);
  });

  it('February and March stay in order at the end of the year (the ClearTax bug)', () => {
    const r = buildReceipts('Priya', [stay(1, m(2026, 4), m(2027, 3))]);
    expect(r.slice(-2).map((x) => x.from)).toEqual([m(2027, 2), m(2027, 3)]);
  });

  it('two rents in one month keep the stays’ order', () => {
    const a = stay(1, m(2026, 4), m(2026, 6));
    const b = stay(2, m(2026, 6), m(2026, 8));
    const june = buildReceipts('Priya', [a, b]).filter((x) => x.from === m(2026, 6));
    expect(june.map((x) => x.stayId)).toEqual([1, 2]);
  });

  it('monthly and quarterly stays mix in date order', () => {
    const q = stay(1, m(2026, 4), m(2026, 9), { frequency: 'quarterly' });
    const mo = stay(2, m(2026, 10), m(2026, 11));
    const r = buildReceipts('Priya', [mo, q]);
    expect(r.map((x) => [x.from, x.till])).toEqual([
      [m(2026, 4), m(2026, 6)],
      [m(2026, 7), m(2026, 9)],
      [m(2026, 10), m(2026, 10)],
      [m(2026, 11), m(2026, 11)],
    ]);
  });

  it('quarterly amount is rent × months', () => {
    const [first] = buildReceipts('Priya', [stay(1, m(2026, 5), m(2026, 9), { rent: 28000, frequency: 'quarterly' })]);
    expect(first).toMatchObject({ months: 2, monthlyRent: 28000, amount: 56000 });
  });

  it('stays without rent are left out; names are trimmed', () => {
    const r = buildReceipts('  Priya  ', [stay(1, m(2026, 4), m(2026, 4), { rent: null }), stay(2, m(2026, 5), m(2026, 5), { owner: ' K. S. ' })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tenant: 'Priya', owner: 'K. S.', no: 1 });
  });

  it('payment mode is kept only when the signature boxes are on', () => {
    const [off] = buildReceipts('P', [stay(1, m(2026, 4), m(2026, 4), { sign: false, mode: 'cash' })]);
    const [on] = buildReceipts('P', [stay(1, m(2026, 4), m(2026, 4), { sign: true, mode: 'cash' })]);
    expect(off!.mode).toBeNull();
    expect(on!.mode).toBe('cash');
  });
});

describe('checks', () => {
  it('overlap names the first shared month and the other stay', () => {
    const stays = [stay(1, m(2026, 4), m(2026, 9)), stay(2, m(2026, 8), m(2027, 3))];
    expect(firstOverlap(stays, 1)).toEqual({ month: m(2026, 8), other: 0 });
    expect(firstOverlap([stays[0]!], 0)).toBeNull();
  });

  it('future months are after the current month', () => {
    expect(futureMonths(stay(1, m(2026, 4), m(2027, 1)), m(2026, 11))).toEqual([m(2026, 12), m(2027, 1)]);
    expect(futureMonths(stay(1, m(2026, 4), m(2026, 11)), m(2026, 11))).toEqual([]);
  });

  it('PAN: 8 months at ₹12,000 (₹96,000) is under the limit', () => {
    const s = stay(1, m(2026, 4), m(2026, 11), { rent: 12000 });
    expect(panNeeded([s], s)).toMatchObject({ needed: false, total: 96000 });
  });

  it('PAN: a rent change mid-year adds up across stays (₹1,02,000)', () => {
    const a = stay(1, m(2026, 4), m(2026, 9), { rent: 8000 });
    const b = stay(2, m(2026, 10), m(2027, 3), { rent: 9000 });
    expect(panNeeded([a, b], a)).toMatchObject({ needed: true, total: 102000, fy: m(2026, 4) });
  });

  it('PAN: totals are per financial year', () => {
    // ₹9,000 × 12 months, but split 6 + 6 across two financial years.
    const s = stay(1, m(2026, 10), m(2027, 9), { rent: 9000 });
    expect(panNeeded([s], s)).toMatchObject({ needed: false, total: 54000 });
  });

  it('cleans rent and PAN input', () => {
    expect(cleanRent('₹ 28,000')).toBe(28000);
    expect(cleanRent('00500')).toBe(500);
    expect(cleanRent('abc')).toBeNull();
    expect(cleanRent('1234567890123')).toBe(123456789);
    expect(cleanPan('abcpv 1234-k')).toBe('ABCPV1234K');
    expect(cleanPan('ABCPV1234KXYZ')).toBe('ABCPV1234K');
  });
});
