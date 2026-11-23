import { describe, expect, it } from 'vitest';
import { toMonth } from '../src/lib/months.ts';
import { largestReceipt, notesFor, problemOf, stampAdvice, type NoteContext } from '../src/lib/notes.ts';
import { rentByFinancialYear, type Stay } from '../src/lib/receipts.ts';

const m = (y: number, month1to12: number) => toMonth(y, month1to12 - 1);
const NOW = m(2026, 11); // November 2026

function stay(id: number, from: number, till: number, extra: Partial<Stay> = {}): Stay {
  return { id, rent: 10000, address: `House ${id}`, owner: `Owner ${id}`, pan: '', from, till, frequency: 'monthly', sign: false, mode: null, ...extra };
}

function notes(stays: Stay[], index = 0, extra: Partial<NoteContext> = {}) {
  return notesFor({ stays, index, tenant: 'Priya', tried: false, now: NOW, totals: rentByFinancialYear(stays), showPanNote: false, ...extra }).map((n) => n.text);
}

describe('notes on a stay', () => {
  it('none for a past stay with nothing wrong', () => {
    expect(notes([stay(1, m(2026, 4), m(2026, 10))])).toEqual([]);
  });

  it('end before start', () => {
    expect(notes([stay(1, m(2026, 6), m(2026, 4))])).toEqual(['The end month is before the start month, so this stay has no receipts yet.']);
  });

  it('overlap names the month and the other stay', () => {
    const stays = [stay(1, m(2026, 4), m(2026, 9)), stay(2, m(2026, 8), m(2026, 10))];
    expect(notes(stays, 1)[0]).toBe('Aug 2026 also appears in Stay 1. That’s fine if you paid two rents that month; otherwise adjust the months.');
  });

  it('future months, one and several', () => {
    expect(notes([stay(1, m(2026, 4), m(2026, 12))])[0]).toBe('Dec 2026 hasn’t happened yet. Receipts are for rent you’ve already paid, so you may want to end at Nov 2026.');
    expect(notes([stay(1, m(2026, 4), m(2027, 1))])[0]).toMatch(/^Dec 2026 – Jan 2027 haven’t happened yet/);
  });

  it('the receipt for this month is dated after today', () => {
    expect(notes([stay(1, m(2026, 4), NOW)])[0]).toBe('November’s receipt will be dated 1 December 2026. Make it once you’ve paid, or end this stay at Oct 2026.');
    const quarter = notes([stay(1, m(2026, 10), NOW, { frequency: 'quarterly' })]);
    expect(quarter[0]).toMatch(/^The October – November 2026 receipt will be dated 1 December 2026/);
  });

  it('the PAN note, for one stay and across stays', () => {
    const one = [stay(1, m(2026, 4), m(2026, 10), { rent: 28000 })];
    expect(notes(one, 0, { showPanNote: true })[0]).toBe('Rent comes to ₹1,96,000 in the 2026-27 financial year, above ₹1,00,000, so your employer will ask for the owner’s PAN. Owner has no PAN? Ask your employer what they accept instead.');
    const two = [stay(1, m(2026, 4), m(2026, 6), { rent: 28000 }), stay(2, m(2026, 7), m(2026, 10), { rent: 30000 })];
    expect(notes(two, 0, { showPanNote: true })[0]).toMatch(/^Rent across your stays comes to ₹2,04,000 .* on every stay marked “Needed”\./);
  });

  it('a wrong PAN is flagged once it is 10 long, or after Generate', () => {
    const bad = 'That PAN doesn’t look right: it’s 5 letters, 4 digits, then a letter.';
    expect(notes([stay(1, m(2026, 4), m(2026, 10), { pan: 'ABCP12' })])).toEqual([]);
    expect(notes([stay(1, m(2026, 4), m(2026, 10), { pan: 'ABCP12' })], 0, { tried: true })).toEqual([bad]);
    expect(notes([stay(1, m(2026, 4), m(2026, 10), { pan: 'ABCPV12345' })])).toEqual([bad]);
    expect(notes([stay(1, m(2026, 4), m(2026, 10), { pan: 'ABCPV1234K' })])).toEqual([]);
  });

  it('letters the PDF cannot print; the name only counts on the first stay', () => {
    const stays = [stay(1, m(2026, 4), m(2026, 6)), stay(2, m(2026, 7), m(2026, 10))];
    expect(notes(stays, 0, { tenant: 'प्रिया' })[0]).toMatch(/^The PDF can only print English letters for now, so “प”/);
    expect(notes(stays, 1, { tenant: 'प्रिया' })).toEqual([]);
  });
});

describe('blank problems', () => {
  it.each([
    ['', 'blank'],
    ['   ', 'blank'],
    ['Priya', null],
    ['José Ñúñez', null],
    ['प्रिया', 'english'],
    ['Ravi 😀', 'english'],
  ])('%j → %s', (value, problem) => expect(problemOf(value)).toBe(problem));
});

describe('stamp advice', () => {
  it('by mode and size', () => {
    expect(stampAdvice(null, 28000)).toBe('Pick one; it prints on the receipts.');
    expect(stampAdvice('cash', 5000)).toMatch(/^Receipts of ₹5,000 or less/);
    expect(stampAdvice('cash', 28000)).toMatch(/^Cash rent over ₹5,000/);
    expect(stampAdvice('bank', 28000)).toMatch(/^Paid by bank transfer or UPI:/);
    expect(stampAdvice('cheque', 28000)).toMatch(/^Paid by cheque:/);
  });

  it('a quarter counts as one receipt of up to three months', () => {
    expect(largestReceipt(stay(1, m(2026, 4), m(2026, 7), { rent: 2000, frequency: 'quarterly' }))).toBe(6000);
    expect(largestReceipt(stay(1, m(2026, 4), m(2026, 7), { rent: 2000 }))).toBe(2000);
    expect(largestReceipt(stay(1, m(2026, 4), m(2026, 7), { rent: null }))).toBe(0);
  });
});
