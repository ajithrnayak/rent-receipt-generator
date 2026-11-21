/** Indian digit grouping: 1234567 → "12,34,567". Whole rupees only. */
export function formatINR(amount: number): string {
  return Math.trunc(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
] as const;

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;

function upTo99(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const ones = n % 10;
  return TENS[Math.floor(n / 10)] + (ones ? ` ${ONES[ones]}` : '');
}

function upTo999(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(upTo99(rest));
  return parts.join(' ');
}

/**
 * Whole rupees in words, in the Indian system (thousand, lakh, crore).
 * 28000 → "Rupees Twenty Eight Thousand only".
 * Amounts of 100 crore or more repeat the crore part ("One Hundred Crore").
 */
export function amountInWords(amount: number): string {
  const n = Math.trunc(amount);
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`amountInWords needs a positive whole number, got ${amount}`);
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${crore > 999 ? amountInWords(crore).replace(/^Rupees | only$/g, '') : upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (rest) parts.push(upTo999(rest));
  return `Rupees ${parts.join(' ')} only`;
}
