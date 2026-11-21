# Rent receipt generator

A free, privacy-first rent receipt generator for Indian salaried employees claiming HRA, at
[rent-receipt-generator.ajith.xyz](https://rent-receipt-generator.ajith.xyz).

Fill in the blanks on the receipt itself and get one PDF with a receipt for every month or quarter.
Nothing you type leaves the browser: there is no server, and the page's Content-Security-Policy
(`connect-src 'none'`) stops it from making any network request with your data.

- A4, two receipts per page, a cut line between them, nothing in the margins
- Several stays (a move, a new owner, a rent change) in one PDF, in strict date order
- Indian digit grouping and the amount in words; exact periods and receipt dates
- Optional signature line and revenue-stamp box, with the payment mode
- Tells you when the owner's PAN is needed

## Develop

Node 22.18 or later.

| Command | Does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build static files into `dist/` |
| `npm run preview` | Serve the build (with the CSP) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright: Chrome, Firefox, WebKit, phone sizes) |
| `npm run fonts` | Re-subset Inter after changing `src/lib/charset.ts` |

## Layout

| Path | What |
|---|---|
| `index.html` | Static page: heading, intro, Why dialog, footer, structured data |
| `src/app/` | The form (Preact), mounted into `#tool` |
| `src/lib/` | Months and dates, money and words, receipts and checks, printable characters |
| `src/pdf/` | PDF layout behind a small canvas interface, drawn with LibPDF; loaded only when needed |
| `fonts/source/` | Inter 4.1 (SIL OFL); `public/fonts/` and `src/assets/fonts/pdf/` are generated subsets |
| `public/_headers` | Security headers for Cloudflare static assets |
| `spike/` | The PDF library comparison (LibPDF, jsPDF, pdf-lib) that chose LibPDF |
| `test/` | Unit tests; `test/e2e/` browser tests |

## Licences

Code: MIT. Inter: SIL Open Font License 1.1 (`fonts/source/OFL-inter.txt`).
