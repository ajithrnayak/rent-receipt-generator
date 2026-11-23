/**
 * A small, dependency-free PDF writer for exactly what the receipts draw: text in
 * three embedded TrueType fonts, lines (solid or dashed) and stroked rectangles.
 *
 * It can stay this small because the fonts are subset at build time
 * (scripts/subset-fonts.ts): each is embedded whole, so it only reads three font
 * tables (head, hhea/hmtx for widths, cmap for glyph ids) instead of subsetting at
 * run time. Text uses Type0 fonts with Identity-H encoding (2-byte glyph ids) and a
 * ToUnicode map, so copying, searching and screen readers get the exact text.
 * Why not a library: docs/decisions.md (#5).
 */
import { A4, type Canvas, type FontBytes, type FontKey, type RGB, type StrokeOpts } from './canvas.ts';

interface Font {
  bytes: Uint8Array;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  bbox: [number, number, number, number];
  /** Advance width of a glyph, in font units. */
  advance: (gid: number) => number;
  /** Code point → glyph id (0, .notdef, when the font lacks it). */
  glyph: Map<number, number>;
  /** Glyph ids drawn so far → their code point, for widths and the ToUnicode map. */
  used: Map<number, number>;
}

/** Reads what the writer needs from a TrueType file. Throws on a font it can't use. */
export function parseFont(bytes: Uint8Array): Font {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, number>();
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const r = 12 + i * 16;
    tables.set(String.fromCharCode(bytes[r]!, bytes[r + 1]!, bytes[r + 2]!, bytes[r + 3]!), v.getUint32(r + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`Font has no ${tag} table`);
    return at;
  };
  const head = table('head'), hhea = table('hhea'), hmtx = table('hmtx'), cmap = table('cmap');
  const numHMetrics = v.getUint16(hhea + 34);
  const advance = (gid: number) => v.getUint16(hmtx + 4 * Math.min(gid, numHMetrics - 1));

  // cmap: format 12 (all of Unicode) if the font has it, else format 4 (the BMP).
  const glyph = new Map<number, number>();
  let f4 = -1, f12 = -1;
  for (let i = 0, n = v.getUint16(cmap + 2); i < n; i++) {
    const sub = cmap + v.getUint32(cmap + 4 + i * 8 + 4);
    const format = v.getUint16(sub);
    if (format === 12) f12 = sub;
    else if (format === 4) f4 = sub;
  }
  if (f12 >= 0) {
    for (let g = 0, n = v.getUint32(f12 + 12); g < n; g++) {
      const r = f12 + 16 + g * 12;
      const start = v.getUint32(r), end = v.getUint32(r + 4), gid = v.getUint32(r + 8);
      for (let c = start; c <= end; c++) glyph.set(c, gid + c - start);
    }
  } else if (f4 >= 0) {
    const segs = v.getUint16(f4 + 6) / 2;
    const ends = f4 + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs;
    for (let s = 0; s < segs; s++) {
      const start = v.getUint16(starts + 2 * s), end = v.getUint16(ends + 2 * s);
      const delta = v.getInt16(deltas + 2 * s), rangeAt = ranges + 2 * s, range = v.getUint16(rangeAt);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid = range === 0 ? c + delta : v.getUint16(rangeAt + range + 2 * (c - start));
        if (range !== 0 && gid !== 0) gid += delta;
        gid &= 0xffff;
        if (gid) glyph.set(c, gid);
      }
    }
  } else {
    throw new Error('Font has no usable cmap');
  }

  const os2 = tables.get('OS/2');
  const ascent = v.getInt16(hhea + 4), descent = v.getInt16(hhea + 6);
  return {
    bytes,
    unitsPerEm: v.getUint16(head + 18),
    ascent,
    descent,
    capHeight: os2 !== undefined && v.getUint16(os2) >= 2 ? v.getInt16(os2 + 88) : Math.round(ascent * 0.7),
    bbox: [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)],
    advance,
    glyph,
    used: new Map(),
  };
}

const enc = new TextEncoder();
const num = (n: number) => String(Math.round(n * 1000) / 1000);
const hex4 = (n: number) => n.toString(16).padStart(4, '0');
/** A PDF text string: a literal for plain ASCII, else UTF-16BE with a byte-order mark (PDF reads other literals as PDFDocEncoding). */
const textString = (s: string) =>
  /^[\x20-\x7e]*$/.test(s)
    ? `(${s.replace(/[()\\]/g, '\\$&')})`
    : `<FEFF${Array.from({ length: s.length }, (_, i) => hex4(s.charCodeAt(i))).join('')}>`;

/** The six-capital-letter tag a subset font's name must carry ("ABCDEF+Inter-Bold"), derived from its bytes. */
function subsetTag(bytes: Uint8Array): string {
  let h = 0x811c9dc5; // FNV-1a
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  let tag = '';
  for (let i = 0; i < 6; i++, h = Math.floor(h / 26)) tag += String.fromCharCode(65 + (h % 26));
  return tag;
}

/** "D:20261123101500Z": a PDF date, in UTC. */
const pdfDate = (d: Date) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

const FONT_NAMES: Record<FontKey, string> = { regular: 'Regular', semibold: 'SemiBold', bold: 'Bold' };

export interface PageSize {
  width: number;
  height: number;
}

/** The writer behind the Canvas interface the layout draws on. Page size defaults to A4. */
export function createPdfCanvas(bytes: FontBytes, page: PageSize = A4, title = 'Rent receipts'): Canvas {
  const keys: FontKey[] = ['regular', 'semibold', 'bold'];
  const fonts = Object.fromEntries(keys.map((k) => [k, parseFont(bytes[k])])) as Record<FontKey, Font>;
  const pages: string[][] = [[]];
  const H = page.height;
  const ops = () => pages[pages.length - 1]!;
  const colour = (c: RGB) => c.map(num).join(' ');
  const stroke = (o: StrokeOpts) => `${num(o.thickness)} w ${colour(o.color)} RG [${(o.dash ?? []).map(num).join(' ')}] 0 d`;

  return {
    pageWidth: page.width,
    pageHeight: page.height,
    addPage() {
      pages.push([]);
    },
    width(text, key, size) {
      const f = fonts[key];
      let w = 0;
      for (const ch of text) w += f.advance(f.glyph.get(ch.codePointAt(0)!) ?? 0);
      return (w * size) / f.unitsPerEm;
    },
    text(text, x, baseline, key, size, color) {
      const f = fonts[key];
      let gids = '';
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        const gid = f.glyph.get(cp) ?? 0;
        if (gid) f.used.set(gid, cp);
        gids += hex4(gid);
      }
      if (gids) ops().push(`BT ${colour(color)} rg /F${keys.indexOf(key)} ${num(size)} Tf ${num(x)} ${num(H - baseline)} Td <${gids}> Tj ET`);
    },
    line(x1, y1, x2, y2, o) {
      ops().push(`${stroke(o)} ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`);
    },
    rect(x, y, w, h, o) {
      ops().push(`${stroke(o)} ${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re S`);
    },
    async save() {
      // Object n is objects[n - 1]: 1 catalog, 2 page tree, 3 document info, then fonts and pages.
      const objects: (Uint8Array | string)[] = [];
      const add = (body: Uint8Array | string) => objects.push(body);
      // Streams are stored uncompressed: a year of receipts is still about 136 KB (LibPDF made 157 KB).
      // Compressing with the browser's CompressionStream crashed Playwright's Firefox in the a11y test,
      // and a bundled deflate would be a dependency for little gain. See docs/decisions.md (#5).
      const stream = (dict: string, data: Uint8Array) => {
        const head = enc.encode(`<< ${dict}${dict ? ' ' : ''}/Length ${data.length} >>\nstream\n`);
        const tail = enc.encode('\nendstream');
        const out = new Uint8Array(head.length + data.length + tail.length);
        out.set(head);
        out.set(data, head.length);
        out.set(tail, head.length + data.length);
        return out;
      };

      add('<< /Type /Catalog /Pages 2 0 R >>');
      add(''); // the page tree, once the page objects are numbered
      // Title and creation date, as LibPDF wrote them. No Producer or Creator: nothing names the tool.
      add(`<< /Title ${textString(title)} /CreationDate (${pdfDate(new Date())}) >>`);

      const fontRefs: number[] = [];
      for (const key of keys) {
        const f = fonts[key];
        const scale = 1000 / f.unitsPerEm;
        const name = `/${subsetTag(f.bytes)}+Inter-${FONT_NAMES[key]}`;
        add(stream(`/Length1 ${f.bytes.length}`, f.bytes));
        const file = objects.length;
        // Flags 4 (symbolic): the font has glyphs outside Adobe's standard Latin set (₹, Latin Extended-A).
        add(`<< /Type /FontDescriptor /FontName ${name} /Flags 4 /FontBBox [${f.bbox.map((n) => num(n * scale)).join(' ')}] /ItalicAngle 0 /Ascent ${num(f.ascent * scale)} /Descent ${num(f.descent * scale)} /CapHeight ${num(f.capHeight * scale)} /StemV 80 /FontFile2 ${file} 0 R >>`);
        const descriptor = objects.length;
        const gids = [...f.used.keys()].sort((a, b) => a - b);
        add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont ${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW ${num(f.advance(0) * scale)} /W [${gids.map((g) => `${g} [${num(f.advance(g) * scale)}]`).join(' ')}] /CIDToGIDMap /Identity >>`);
        const cid = objects.length;
        const cmap = [
          '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
          '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def',
          '1 begincodespacerange <0000> <FFFF> endcodespacerange',
        ];
        for (let i = 0; i < gids.length; i += 100) {
          const chunk = gids.slice(i, i + 100); // at most 100 entries per block
          cmap.push(`${chunk.length} beginbfchar`);
          for (const g of chunk) {
            const cp = f.used.get(g)!;
            const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
            cmap.push(`<${hex4(g)}> <${units.map(hex4).join('')}>`);
          }
          cmap.push('endbfchar');
        }
        cmap.push('endcmap CMapName currentdict /CMap defineresource pop end end');
        add(stream('', enc.encode(cmap.join('\n'))));
        const toUnicode = objects.length;
        add(`<< /Type /Font /Subtype /Type0 /BaseFont ${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
        fontRefs.push(objects.length);
      }
      const fontDict = fontRefs.map((ref, i) => `/F${i} ${ref} 0 R`).join(' ');

      const kids: number[] = [];
      for (const content of pages) {
        add(stream('', enc.encode(content.join('\n'))));
        const contentRef = objects.length;
        add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fontDict} >> >> /Contents ${contentRef} 0 R >>`);
        kids.push(objects.length);
      }
      objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

      // Header (with high bytes, so tools treat the file as binary), objects, cross-reference table, trailer.
      const parts: Uint8Array[] = [new Uint8Array([...enc.encode('%PDF-1.7\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
      let offset = parts[0]!.length;
      const offsets: number[] = [];
      objects.forEach((body, i) => {
        offsets.push(offset);
        for (const b of [enc.encode(`${i + 1} 0 obj\n`), typeof body === 'string' ? enc.encode(body) : body, enc.encode('\nendobj\n')]) {
          parts.push(b);
          offset += b.length;
        }
      });
      const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
      // A random file identifier (recommended in PDF 1.7, required in 2.0); both halves are equal for a new file.
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      parts.push(enc.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${offset}\n%%EOF\n`));
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      return out;
    },
  };
}
