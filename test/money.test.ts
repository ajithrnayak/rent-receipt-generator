import { describe, expect, it } from 'vitest';
import { amountInWords, formatINR } from '../src/lib/money.ts';

describe('formatINR: Indian digit grouping', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [28000, '28,000'],
    [100000, '1,00,000'],
    [196000, '1,96,000'],
    [1234567, '12,34,567'],
    [123456789, '12,34,56,789'],
  ])('%i → %s', (n, s) => expect(formatINR(n)).toBe(s));
});

describe('amountInWords', () => {
  it.each([
    [1, 'Rupees One only'],
    [15, 'Rupees Fifteen only'],
    [20, 'Rupees Twenty only'],
    [99, 'Rupees Ninety Nine only'],
    [100, 'Rupees One Hundred only'],
    [101, 'Rupees One Hundred One only'],
    [999, 'Rupees Nine Hundred Ninety Nine only'],
    [1000, 'Rupees One Thousand only'],
    [5000, 'Rupees Five Thousand only'],
    [8333, 'Rupees Eight Thousand Three Hundred Thirty Three only'],
    [28000, 'Rupees Twenty Eight Thousand only'],
    [32500, 'Rupees Thirty Two Thousand Five Hundred only'],
    [84000, 'Rupees Eighty Four Thousand only'],
    [99999, 'Rupees Ninety Nine Thousand Nine Hundred Ninety Nine only'],
    [100000, 'Rupees One Lakh only'],
    [100001, 'Rupees One Lakh One only'],
    [125000, 'Rupees One Lakh Twenty Five Thousand only'],
    [1000000, 'Rupees Ten Lakh only'],
    [9999999, 'Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine only'],
    [10000000, 'Rupees One Crore only'],
    [123456789, 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine only'],
    [999999999, 'Rupees Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine only'],
    [1000000000, 'Rupees One Hundred Crore only'],
  ])('%i', (n, words) => expect(amountInWords(n)).toBe(words));

  it('ignores paise', () => expect(amountInWords(28000.75)).toBe('Rupees Twenty Eight Thousand only'));

  it.each([0, -5, Number.NaN])('rejects %s', (n) => expect(() => amountInWords(n)).toThrow(RangeError));

  it('never has double spaces', () => {
    for (let n = 1; n < 200_000; n += 997) expect(amountInWords(n)).not.toMatch(/ {2}/);
  });
});
