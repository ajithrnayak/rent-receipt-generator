import { describe, expect, it } from 'vitest';
import {
  daysIn, fyLabel, fyStartOf, longLabel, parseYear, periodOf, quarterStartOf, receiptDateOf, spanOf, spanTitle, toMonth,
} from '../src/lib/months.ts';

const m = (y: number, month1to12: number) => toMonth(y, month1to12 - 1);

describe('typed years', () => {
  it.each([
    ['2026', 2026],
    ['1900', 1900],
    ['2099', 2099],
    [' 2019 ', 2019],
    ['20', null],
    ['', null],
    ['1899', null],
    ['2100', null],
    ['20a6', null],
    ['02026', null],
  ])('%j → %s', (text, year) => expect(parseYear(text)).toBe(year));
});

describe('period of a month: 1st to the real last day', () => {
  it.each([
    [m(2026, 4), '1 April 2026', '30 April 2026'],
    [m(2026, 9), '1 September 2026', '30 September 2026'],
    [m(2026, 12), '1 December 2026', '31 December 2026'],
    [m(2027, 2), '1 February 2027', '28 February 2027'],
    [m(2028, 2), '1 February 2028', '29 February 2028'], // leap year
    [m(2100, 2), '1 February 2100', '28 February 2100'], // not a leap year
  ])('%i', (month, from, to) => expect(periodOf(month)).toEqual({ from, to }));

  it('days in every month of 2026', () => {
    expect(Array.from({ length: 12 }, (_, i) => daysIn(m(2026, i + 1)))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });
});

describe('receipt date: 1st of the next month, but 31 March for March', () => {
  it.each([
    [m(2026, 4), '1 May 2026'],
    [m(2026, 9), '1 October 2026'],
    [m(2026, 12), '1 January 2027'], // across the year end
    [m(2027, 2), '1 March 2027'],
    [m(2027, 3), '31 March 2027'], // stays inside the financial year
    [m(2026, 6), '1 July 2026'], // end of an Apr–Jun quarter
  ])('%i → %s', (till, date) => expect(receiptDateOf(till)).toBe(date));
});

describe('spans', () => {
  it('quarter period', () => expect(spanOf(m(2026, 4), m(2026, 6))).toEqual({ from: '1 April 2026', to: '30 June 2026' }));
  it('single month title', () => expect(spanTitle(m(2026, 9), m(2026, 9))).toBe('September 2026'));
  it('same-year title', () => expect(spanTitle(m(2026, 10), m(2026, 12))).toBe('October – December 2026'));
  it('cross-year title', () => expect(spanTitle(m(2026, 11), m(2027, 2))).toBe('November 2026 – February 2027'));
  it('long label', () => expect(longLabel(m(2027, 1))).toBe('January 2027'));
});

describe('financial years and quarters', () => {
  it.each([
    [m(2026, 4), m(2026, 4), '2026-27'],
    [m(2027, 3), m(2026, 4), '2026-27'],
    [m(2026, 3), m(2025, 4), '2025-26'],
    [m(2099, 12), m(2099, 4), '2099-00'],
  ])('%i', (month, fy, label) => {
    expect(fyStartOf(month)).toBe(fy);
    expect(fyLabel(month)).toBe(label);
  });

  it.each([
    [m(2026, 4), m(2026, 4)],
    [m(2026, 6), m(2026, 4)],
    [m(2026, 7), m(2026, 7)],
    [m(2026, 12), m(2026, 10)],
    [m(2027, 2), m(2027, 1)],
    [m(2027, 3), m(2027, 1)],
  ])('quarter of %i starts %i', (month, start) => expect(quarterStartOf(month)).toBe(start));
});
