# Decisions

Why the project is built the way it is: short records, newest concerns last. Before reversing one, read its "why". If you make a new decision of this weight, add it here. Where the original reasoning wasn't recorded, the entry says so; don't invent one.

## 1. Everything happens in the browser; nothing is stored

- **Decision:** static files only. No server, account, analytics, cookies or storage, and the form isn't saved even in `localStorage`.
- **Why:** the product's promise ("No email. No phone number.") is that a tenant's name, address and the owner's PAN never leave the tab.
- **Consequences:** a refresh loses the form. Any feature that needs a server or persistence is out of scope unless the owner decides otherwise.

## 2. The browser enforces the privacy promise (CSP)

- **Decision:** a strict Content-Security-Policy: `connect-src 'none'`, `default-src 'none'`, scripts, styles, fonts and images from `'self'` only, no inline styles, no `data:`. It's sent as a header (`public/_headers`) and as a build-time meta tag (`vite.config.ts`). `test/csp.test.ts` keeps the two equal.
- **Why:** so the promise doesn't rest on code review alone. Fetch, XHR, WebSocket and beacons are blocked outright.
- **Consequences:** fonts for the PDF are bundled into the script (decision 5); no `modulePreload` polyfill; no inline styles. The CSP doesn't cover every channel (navigation, WebRTC), and the README says so rather than overclaiming.

## 3. The receipt is the form

- **Decision:** people type into blanks in the receipt's own sentence. The results preview and the PDF share one source of wording (`src/lib/wording.ts`).
- **Why:** what you see is what prints; no separate "preview" that can differ (commit `cb2b18f`).
- **Consequences:** the form sentence in `StayCard.tsx` mirrors the receipt wording by hand. Changing the wording touches several files (see AGENTS.md, Change recipes).

## 4. Nothing on the receipts but the receipt

- **Decision:** no credit, link, logo or site address on the PDF, in the page content or the file's Creator/Producer properties.
- **Why:** the employer should see a rent receipt, not an ad. The credit was removed from the PDF in `cb2b18f`; the metadata in `935e761`.
- **Consequences:** the page footer carries the credit instead. Tests fail if branding reaches the PDF.

## 5. Our own PDF writer, loaded lazily, fonts inlined

- **Decision:** `src/pdf/writer.ts`, a small dependency-free PDF writer, draws the receipts behind the `Canvas` interface (`src/pdf/canvas.ts`). The PDF chunk (writer plus three Inter subsets, about 50 KB gzip) loads on first input or on Generate. The fonts are `?inline` imports. LibPDF (`@libpdf/core`) remains a dev dependency, used only by tests to read our PDFs back.
- **Why (benchmark, 2026-11-23):** the first choice, LibPDF, was picked after a quick browse. It was then measured against the alternatives:
  - Each candidate implemented the same `Canvas`.
  - Each drew the same receipts with the real layout and the build-time font subsets.
  - Each was built as a production chunk.

  | | Own writer (as shipped) | jsPDF 4.2.1 | LibPDF 0.5.3 | @cantoo/pdf-lib 2.11 | pdf-lib 1.17 |
  |---|---|---|---|---|---|
  | Chunk, brotli | **42.8 KB** | 148.4 KB | 236.2 KB | 375.8 KB | 447.1 KB |
  | 12 receipts, Node | **2 ms** | 17 ms | 14 ms | 24 ms | 25 ms |
  | PDF of 12 receipts | 136 KB (uncompressed) | 36 KB | 157 KB | 92 KB | 72 KB |
  | Exact text, same line breaks, same rendering | yes | yes | (baseline) | text yes | text yes |

  - **LibPDF:** 39% of its chunk was PDF-signing code (`pkijs`, `asn1js`) that can't be tree-shaken out.
  - **pdf-lib family:** its font engine carries large Unicode tables.
  - **jsPDF:** a fair, maintained runner-up, but three times our size, and it ships unused html2canvas/DOMPurify/canvg chunks.
  - **Own writer:** can stay small because the fonts are already subset at build time, so it only reads three font tables and writes standard PDF font objects. It also takes third-party code out of the PDF path.
  - Checked in four independent readers: LibPDF's parser, macOS (`sips`), Firefox's pdf.js and Chrome's PDFium. Those readers repair broken files silently, so a unit test also checks the structure exactly (cross-reference offsets, `startxref`, stream lengths), which stricter readers such as Acrobat depend on.
- **Consequences:**
  - We own about 230 lines of PDF code. Tests in `test/pdf.test.ts` pin it against LibPDF (glyph lookup, widths, text round trip, pages) and check its file structure.
  - Streams are stored uncompressed. A year of receipts is about 136 KB, still smaller than LibPDF's 157 KB. Compressing with the browser's `CompressionStream` made the file 57 KB, but it crashed Playwright's Firefox (the crash couldn't be ruled out for real Firefox). A small bundled deflate could be added later if size matters, at the cost of a dependency.
  - The PDF properties carry only a Title and creation date (as LibPDF wrote them). Fonts are tagged subsets marked symbolic, and the file has a random `/ID`, for strict readers and validators.

## 6. Pre-render the form, then replace it

- **Decision:** the build renders `<App />` into `index.html` (`prerender-form` in `vite.config.ts`). In the browser `main.tsx` replaces it with a live render, after keeping anything already typed (`src/app/seed.ts`).
- **Why:** crawlers and the first paint see the receipt. Measured on mobile, layout shift went from 0.41 to 0.04 and Lighthouse from 81 to 99 (`0246ae7`). It's replaced rather than hydrated because the pre-render carries the build date.
- **Consequences:** `App` must render in Node, and the first stay's field ids are a contract with `seed.ts`.

## 7. Months are integers

- **Decision:** `Month = year * 12 + monthIndex`. No `Date` objects in the logic.
- **Why:** ranges, sorting and "next month" are plain arithmetic, and there are no time-zone bugs (comment in `src/lib/months.ts`).

## 8. Domain rules take the stricter reading

- **Decision:**
  - The ₹1 lakh PAN threshold is totalled across all stays in a financial year.
  - March receipts are dated 31 March.
  - Quarters follow the financial year.
- **Why:** the sources don't settle whether the PAN limit is per owner, so the tool errs towards asking for the PAN. Dating March on the 31st keeps the receipt in the financial year. Details are in [rules.md](rules.md).

## 9. Text the PDF can't print blocks Generate

- **Decision:** names or addresses with characters outside the font subset (`src/lib/charset.ts`) stop Generate and highlight the field.
- **Why:** PDF code doesn't fail on missing glyphs (LibPDF garbled them; our writer draws an empty box). A warning alone let people download a receipt with a garbled name (`935e761`).
- **Consequences:** names must be typed in Latin script for now. Supporting Indian scripts would mean new fonts and text shaping.

## 10. Secondary content lives in dialogs, still in the HTML

- **Decision:** "Why use this?", "How it works" and "Sample receipt" (titled "Rent receipt format") are native `<dialog>`s opened from a link row. Their text is in the static HTML.
- **Why:** the form already looks like the final receipt, so a separate sample section was redundant on the page. Keeping the text in the HTML keeps it indexable (`47fe7fc`).

## 11. Typed years, from 1900 to 2099

- **Decision:** years are typed digit boxes; months stay as menus.
- **Why:** receipts for any year, not a fixed range in a drop-down. The "Fill" shortcuts cover the common cases (`47fe7fc`).

## 12. Preact for the UI

- **Decision:** Preact (with hooks) renders the form and results.
- **Why:** not discussed when the project started. Observed effect: the whole entry chunk (Preact plus the app) is about 15 KB gzip. There's no reason on record to keep it over alternatives, and none to switch either.

## 13. Light theme only

- **Decision:** one light colour scheme (`color-scheme: light`), no dark mode.
- **Why:** simplicity. The output is a printed receipt, which is always light, and the form is the receipt.

## 14. Push to `main` deploys; the build runs the tests

- **Decision:** Cloudflare Workers Builds deploys every push to `main`. `npm run build` runs the unit tests before building.
- **Why:** one simple path to production, and a failing unit test stops a deploy (`935e761`).
- **Consequences:** never push to `main` without the owner's go-ahead. Browser tests aren't part of the deploy; run them yourself (see [testing.md](testing.md)).
