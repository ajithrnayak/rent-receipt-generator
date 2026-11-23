import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDF } from '@libpdf/core';
import { PRINTABLE_TEXT, unprintable } from '../src/lib/charset.ts';
import { toMonth } from '../src/lib/months.ts';
import { buildReceipts, type Stay } from '../src/lib/receipts.ts';
import type { Canvas } from '../src/pdf/canvas.ts';
import { receiptText, renderReceipts, wrap } from '../src/pdf/layout.ts';
import { createLibPdfCanvas } from '../src/pdf/libpdf.ts';

const m = (y: number, month1to12: number) => toMonth(y, month1to12 - 1);

function stay(extra: Partial<Stay> = {}): Stay {
  return {
    id: 1, rent: 28000, address: 'Flat 1104, Tower B, Prestige Shantiniketan, Whitefield Main Road, Hoodi, Bengaluru 560048',
    owner: 'Meenakshi Sundaram Iyer', pan: 'AAKPI9876Q', from: m(2026, 4), till: m(2027, 3), frequency: 'monthly', sign: true, mode: 'cash', ...extra,
  };
}

/** A fake canvas: fixed-width glyphs, and a log of what was drawn. */
function fakeCanvas() {
  const ops: { op: string; args: unknown[] }[] = [];
  const c: Canvas = {
    pageWidth: 595.28,
    pageHeight: 841.89,
    addPage: () => ops.push({ op: 'page', args: [] }),
    width: (text, _f, size) => text.length * size * 0.5,
    text: (...args) => ops.push({ op: 'text', args }),
    line: (...args) => ops.push({ op: 'line', args }),
    rect: (...args) => ops.push({ op: 'rect', args }),
    save: async () => new Uint8Array(),
  };
  return { c, ops };
}

describe('layout', () => {
  it('two receipts per page; a cut line only when the lower half is used', async () => {
    const receipts = buildReceipts('Priya', [stay({ till: m(2026, 6) })]); // 3 receipts
    const { c, ops } = fakeCanvas();
    await renderReceipts(c, receipts);
    expect(ops.filter((o) => o.op === 'page')).toHaveLength(1); // 2 pages: first is implicit
    const cutLines = ops.filter((o) => o.op === 'line' && (o.args[4] as { dash?: number[] }).dash?.[0] === 4);
    expect(cutLines).toHaveLength(1);
  });

  it('draws receipt titles in strict date order', async () => {
    const { c, ops } = fakeCanvas();
    await renderReceipts(c, buildReceipts('Priya', [stay()]));
    const titles = ops.filter((o) => o.op === 'text' && o.args[3] === 'bold').map((o) => o.args[0]);
    expect(titles[0]).toBe('April 2026');
    expect(titles.slice(-2)).toEqual(['February 2027', 'March 2027']);
  });

  it('prints the payment mode only with the signature boxes', async () => {
    const texts = async (s: Stay) => {
      const { c, ops } = fakeCanvas();
      await renderReceipts(c, buildReceipts('Priya', [s]));
      return ops.filter((o) => o.op === 'text').map((o) => o.args[0]);
    };
    expect(await texts(stay({ till: m(2026, 4) }))).toContain('Mode of payment');
    expect(await texts(stay({ till: m(2026, 4), sign: false }))).not.toContain('Mode of payment');
    expect(await texts(stay({ till: m(2026, 4), sign: false }))).not.toContain('₹1 stamp');
  });

  it('puts nothing but receipts on the page: no credit, link or branding', async () => {
    const { c, ops } = fakeCanvas();
    await renderReceipts(c, buildReceipts('Priya', [stay()]));
    const drawn = ops.filter((o) => o.op === 'text').map((o) => String(o.args[0]).toLowerCase());
    expect(drawn.filter((t) => /ajith|\.xyz|made by|https?:|www\./.test(t))).toEqual([]);
  });

  it('wraps by words and breaks a word longer than the line', () => {
    const measure = { width: (t: string, _f: unknown, size: number) => t.length * size * 0.5 };
    const lines = wrap(measure, [{ text: 'aaaa bbbb cccc', font: 'regular' }], 10, 50); // 10 chars per line
    expect(lines.map((l) => l.map((p) => p.text).join(''))).toEqual(['aaaa bbbb ', 'cccc']);
    const long = wrap(measure, [{ text: 'x'.repeat(25), font: 'regular' }], 10, 50);
    expect(long.length).toBe(3);
    expect(long.flat().map((p) => p.text).join('')).toBe('x'.repeat(25));
  });
});

describe('fonts', () => {
  it('every fixed and generated string the PDF draws is in the printable set', () => {
    const r = buildReceipts('José Ñúñez', [stay({ frequency: 'quarterly' })]);
    for (const receipt of r) {
      for (const s of receiptText(receipt)) expect(unprintable(s), s).toEqual([]);
    }
  });

  it('flags scripts the font cannot print', () => {
    expect(unprintable('प्रिया')).not.toEqual([]);
    expect(unprintable('Priya, 4th Cross – Bengaluru ₹')).toEqual([]);
  });

  it.each(['Regular', 'SemiBold', 'Bold'])('the %s subset font has a glyph for every printable character', (weight) => {
    const bytes = new Uint8Array(readFileSync(new URL(`../src/assets/fonts/pdf/Inter-${weight}.ttf`, import.meta.url)));
    const font = PDF.create().embedFont(bytes);
    expect(font.getUnencodableCharacters(PRINTABLE_TEXT)).toEqual([]);
  });

  it('a real PDF from the subset fonts extracts exactly, ₹ included', async () => {
    const font = (w: string) => new Uint8Array(readFileSync(new URL(`../src/assets/fonts/pdf/Inter-${w}.ttf`, import.meta.url)));
    const canvas = createLibPdfCanvas({ regular: font('Regular'), semibold: font('SemiBold'), bold: font('Bold') });
    const bytes = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay({ till: m(2026, 5) })]));
    const text = (await PDF.load(bytes)).extractText().map((p) => p.text).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('₹28,000 (Rupees Twenty Eight Thousand only)');
    expect(text).toContain('1 April 2026 to 30 April 2026');
    expect(text).toContain('Date: 1 May 2026');
    expect(text).toContain('Received from Priya Raghavan the sum of');
    expect(text).toContain('towards rent for the property at');
    expect(text).not.toContain('with thanks');
    expect(PRINTABLE_TEXT).toContain('₹');
  });

  it('the file itself carries no web address or credit either (document properties)', async () => {
    const font = (w: string) => new Uint8Array(readFileSync(new URL(`../src/assets/fonts/pdf/Inter-${w}.ttf`, import.meta.url)));
    const canvas = createLibPdfCanvas({ regular: font('Regular'), semibold: font('SemiBold'), bold: font('Bold') });
    const bytes = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay({ till: m(2026, 4) })]));
    const pdf = await PDF.load(bytes);
    const props = [pdf.getTitle(), pdf.getCreator(), pdf.getProducer()].join(' ').toLowerCase();
    expect(props).not.toMatch(/ajith|\.xyz|https?:|www\./);
    expect(Buffer.from(bytes).toString('latin1').toLowerCase()).not.toMatch(/ajith|\.xyz/);
  });
});
