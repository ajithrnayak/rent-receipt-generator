import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDF } from '@libpdf/core';
import { PRINTABLE_TEXT, unprintable } from '../src/lib/charset.ts';
import { toMonth } from '../src/lib/months.ts';
import { buildReceipts, type Stay } from '../src/lib/receipts.ts';
import type { Canvas } from '../src/pdf/canvas.ts';
import { receiptText, renderReceipts, wrap } from '../src/pdf/layout.ts';
import { createPdfCanvas, parseFont } from '../src/pdf/writer.ts';

const m = (y: number, month1to12: number) => toMonth(y, month1to12 - 1);
const font = (w: string) => new Uint8Array(readFileSync(new URL(`../src/assets/fonts/pdf/Inter-${w}.ttf`, import.meta.url)));
const fonts = () => ({ regular: font('Regular'), semibold: font('SemiBold'), bold: font('Bold') });
/** The text of a PDF as LibPDF (an independent reader) extracts it, whitespace flattened. */
const extract = async (bytes: Uint8Array) => (await PDF.load(bytes)).extractText().map((p) => p.text).join(' ').replace(/\s+/g, ' ');

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
    const embedded = PDF.create().embedFont(font(weight));
    expect(embedded.getUnencodableCharacters(PRINTABLE_TEXT)).toEqual([]);
  });

  it('a real PDF from the subset fonts extracts exactly, ₹ included', async () => {
    const canvas = createPdfCanvas(fonts());
    const bytes = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay({ till: m(2026, 5) })]));
    const text = await extract(bytes);
    expect(text).toContain('₹28,000 (Rupees Twenty Eight Thousand only)');
    expect(text).toContain('1 April 2026 to 30 April 2026');
    expect(text).toContain('Date: 1 May 2026');
    expect(text).toContain('Received from Priya Raghavan the sum of');
    expect(text).toContain('towards rent for the property at');
    expect(text).not.toContain('with thanks');
    expect(PRINTABLE_TEXT).toContain('₹');
  });

  it('the file itself carries no web address or credit either (document properties)', async () => {
    const canvas = createPdfCanvas(fonts());
    const bytes = await renderReceipts(canvas, buildReceipts('Priya Raghavan', [stay({ till: m(2026, 4) })]));
    const pdf = await PDF.load(bytes);
    const props = [pdf.getTitle(), pdf.getCreator(), pdf.getProducer()].join(' ').toLowerCase();
    expect(props).not.toMatch(/ajith|\.xyz|https?:|www\./);
    expect(Buffer.from(bytes).toString('latin1').toLowerCase()).not.toMatch(/ajith|\.xyz/);
  });
});

describe('PDF writer (src/pdf/writer.ts), checked by an independent reader', () => {
  it.each(['Regular', 'SemiBold', 'Bold'])('reads a glyph for every printable character from the %s cmap', (weight) => {
    const parsed = parseFont(font(weight));
    expect(Array.from(PRINTABLE_TEXT).filter((ch) => !parsed.glyph.get(ch.codePointAt(0)!))).toEqual([]);
  });

  it('measures text as LibPDF does: each glyph, and each line of a receipt (line breaks depend on it)', () => {
    const ours = createPdfCanvas(fonts());
    const theirs = PDF.create();
    const texts = buildReceipts('José Ñúñez D’Souza', [stay({ frequency: 'quarterly' })]).flatMap(receiptText);
    for (const [key, file] of [['regular', 'Regular'], ['semibold', 'SemiBold'], ['bold', 'Bold']] as const) {
      const ref = theirs.embedFont(font(file));
      // LibPDF rounds each glyph slightly differently; under 0.01 pt a glyph, so it only adds up over hundreds of them.
      for (const ch of PRINTABLE_TEXT) expect(Math.abs(ours.width(ch, key, 12) - ref.widthOfTextAtSize(ch, 12)), `${key}: ${ch}`).toBeLessThan(0.01);
      for (const t of texts) expect(Math.abs(ours.width(t, key, 12) - ref.widthOfTextAtSize(t, 12)), `${key}: ${t}`).toBeLessThan(0.2);
    }
  });

  it('every printable character round-trips through the PDF text, in every weight', async () => {
    const c = createPdfCanvas(fonts());
    const chunks = PRINTABLE_TEXT.replace(/\s/g, '').match(/.{1,40}/gu)!;
    chunks.forEach((chunk, i) => {
      c.text(chunk, 40, 60 + i * 20, 'regular', 10, [0, 0, 0]);
      c.text(chunk, 240, 60 + i * 20, 'semibold', 10, [0, 0, 0]);
      c.text(chunk, 440, 60 + i * 20, 'bold', 10, [0, 0, 0]);
    });
    const text = await extract(await c.save());
    for (const chunk of chunks) expect(text.split(chunk).length - 1, chunk).toBe(3);
  });

  it('pages, page size and title', async () => {
    const receipts = buildReceipts('Priya', [stay({ till: m(2026, 8) })]); // 5 receipts: 3 pages
    const bytes = await renderReceipts(createPdfCanvas(fonts()), receipts);
    const pdf = await PDF.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBe('Rent receipts');
    const half = await createPdfCanvas(fonts(), { width: 595.28, height: 420.945 }).save();
    expect(Buffer.from(half).toString('latin1')).toContain('/MediaBox [0 0 595.28 420.945]');
  });

  it('is structurally exact: xref offsets, startxref and stream lengths (lenient viewers would hide mistakes; Acrobat would not)', async () => {
    const bytes = await renderReceipts(createPdfCanvas(fonts()), buildReceipts('José Ñúñez D’Souza', [stay({ till: m(2026, 8) })])); // 3 pages
    const raw = Buffer.from(bytes).toString('latin1'); // one char per byte, so string offsets are byte offsets
    const startxref = Number(raw.match(/startxref\n(\d+)\n%%EOF\n$/)![1]);
    expect(raw.startsWith('xref\n', startxref)).toBe(true);
    const [, first, count] = raw.slice(startxref).match(/^xref\n(\d+) (\d+)\n/)!;
    expect(first).toBe('0');
    const entriesAt = startxref + `xref\n0 ${count}\n`.length;
    const size = Number(raw.match(/trailer\n<< \/Size (\d+)/)![1]);
    expect(Number(count)).toBe(size);
    for (let n = 0; n < size; n++) {
      const entry = raw.slice(entriesAt + n * 20, entriesAt + (n + 1) * 20);
      expect(entry, `xref entry ${n}`).toMatch(n === 0 ? /^0000000000 65535 f \n$/ : /^\d{10} 00000 n \n$/);
      if (n > 0) expect(raw.startsWith(`${n} 0 obj\n`, Number(entry.slice(0, 10))), `object ${n} offset`).toBe(true);
    }
    const streams = [...raw.matchAll(/\/Length (\d+) >>\nstream\n/g)];
    expect(streams.length).toBeGreaterThan(6); // 3 fonts + 3 ToUnicode maps + a content stream per page
    for (const s of streams) {
      const start = s.index! + s[0].length;
      expect(raw.startsWith('\nendstream', start + Number(s[1])), `stream at ${s.index}`).toBe(true);
    }
  });

  it('names fonts as tagged subsets, marks them symbolic, and gives a missing glyph the width the layout measured', async () => {
    const c = createPdfCanvas(fonts());
    c.text('Rāmदेव', 40, 60, 'regular', 10, [0, 0, 0]); // Devanagari isn't in the font: drawn as glyph 0
    const raw = Buffer.from(await c.save()).toString('latin1');
    for (const name of ['Regular', 'SemiBold', 'Bold']) expect(raw).toMatch(new RegExp(`/FontName /[A-Z]{6}\\+Inter-${name} `));
    expect(raw.match(/\/Flags (\d+)/g)).toEqual(['/Flags 4', '/Flags 4', '/Flags 4']);
    const regular = parseFont(font('Regular'));
    const dw = Number(raw.match(/\/DW ([\d.]+)/)![1]);
    expect(dw).toBeCloseTo((regular.advance(0) * 1000) / regular.unitsPerEm, 2);
    expect(dw).toBeGreaterThan(0);
  });

  it('has a fresh file ID, a creation date, and a Unicode-safe title', async () => {
    const save = () => createPdfCanvas(fonts(), undefined, 'Rent receipts – 2026').save();
    const [a, b] = [Buffer.from(await save()).toString('latin1'), Buffer.from(await save()).toString('latin1')];
    const id = (raw: string) => raw.match(/\/ID \[<([0-9a-f]{32})> <\1>\]/)?.[1];
    expect(id(a)).toBeTruthy();
    expect(id(a)).not.toBe(id(b));
    expect(a).toMatch(/\/CreationDate \(D:\d{14}Z\)/);
    expect((await PDF.load(new Uint8Array(Buffer.from(a, 'latin1')))).getTitle()).toBe('Rent receipts – 2026');
  });

  it('needs no browser APIs beyond TextEncoder (no compression streams), and stays small', async () => {
    const bytes = await renderReceipts(createPdfCanvas(fonts()), buildReceipts('Priya Raghavan', [stay()])); // 12 receipts
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('/Filter');
    expect(bytes.length).toBeLessThan(160 * 1024); // LibPDF made 157 KB of the same
    expect(await extract(bytes)).toContain('Received from Priya Raghavan the sum of ₹28,000');
  });
});
