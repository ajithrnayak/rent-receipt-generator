import type { Receipt } from './layout.ts';
import { monthsBetween, toMonth } from '../src/lib/months.ts';

/**
 * A realistic year: a move in September, so two stays, one with the signature
 * and stamp boxes on. September is the longest month name; the second address
 * is long enough to wrap.
 */
const stayA = {
  tenant: 'Priya Raghavan',
  amount: 28000,
  address: '14, 2nd Cross, Indiranagar, Bengaluru 560038',
  owner: 'K. S. Venkatesh',
  pan: 'ABCPV1234K',
  sign: false,
} as const;

const stayB = {
  tenant: 'Priya Raghavan',
  amount: 32500,
  address: 'Flat 1104, Tower B, Prestige Shantiniketan, Whitefield Main Road, Hoodi, Bengaluru 560048',
  owner: 'Meenakshi Sundaram Iyer',
  pan: 'AAKPI9876Q',
  sign: true,
  mode: 'cash',
} as const;

export function sampleYear(): Receipt[] {
  const a = monthsBetween(toMonth(2026, 3), toMonth(2026, 7)).map((month) => ({ ...stayA, month }));
  const b = monthsBetween(toMonth(2026, 8), toMonth(2027, 2)).map((month) => ({ ...stayB, month }));
  return [...a, ...b].sort((x, y) => x.month - y.month).map((r, i) => ({ ...r, no: i + 1 }));
}
