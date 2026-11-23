# Architecture

How the pieces fit, from build to the PDF in someone's downloads folder. For *why* things are this way, see [decisions.md](decisions.md); for traps, [gotchas.md](gotchas.md).

## The shape of it

```
index.html (static content, dialogs, JSON-LD)
   │  build: prerender-form renders <App /> into <main id="tool">, csp-meta adds the CSP tag
   ▼
dist/ ── Cloudflare static assets (wrangler.jsonc), headers from public/_headers
   │
   ▼  in the browser
main.tsx ── readPrerendered() keeps anything typed so far ── render(<App seed>) replaces the form
   │                                                       └─ wires the three <dialog>s
   ▼
App (state + Generate) ── StayCard × n (the receipt-shaped form) ── Results (preview + download)
   │  on first input: warmPdf() starts loading the PDF chunk
   ▼  on Generate
buildReceipts() → makePdf() [lazy chunk: our PDF writer + inlined fonts] → Blob → object URL → <a download>
```

There is no server code, API, storage or service worker. The only network requests are the page's own static files.

## Data model

- **`Month`** (`src/lib/months.ts`) is an integer: `year * 12 + monthIndex`, where January is 0. Ranges, sorting and "next month" are plain arithmetic, and there are no time zones. Labels and dates are formatted from it (`longLabel`, `spanOf`, `receiptDateOf`). The only `Date` is in `today()` (`src/app/state.ts`), which reads the local month once and again when the tab becomes visible.
- **`Stay`** (`src/lib/receipts.ts`): one home, owner and rent over `from`…`till`, plus `frequency` (monthly or quarterly), `sign` (signature and stamp boxes) and `mode` (how rent was paid). `rent` is `null` while blank.
- **`Receipt`**: one receipt in the PDF. `buildReceipts(tenant, stays)` splits each stay into periods (`periodsOf`), sorts every receipt by date across stays, and numbers them.
- **`Wording`** (`src/lib/wording.ts`): what one receipt says, as styled text runs. It's shared by the PDF layout and the HTML preview, so they can't disagree.

## UI state (`src/app/`)

- `state.ts`: a reducer over `{ tenant, stays, nextId, tried }`. `tried` turns on error highlighting after the first Generate. `initialState(today, seed)` starts one stay on the current financial year to date, merged with the `seed` from the pre-rendered form.
- `App.tsx` owns:
  - **Derived values**, computed every render: `receipts`, `totals` (rent per financial year, for the PAN rule) and `key` (a JSON snapshot of the inputs).
  - **Validation:** `missing` (empty blanks) and `notEnglish` (unprintable text), both from `problemOf`. Either one blocks Generate and focuses the first `.miss` field.
  - **The PDF state machine** `gen`: `idle` → `working` → `ready` | `error`. Any edit changes `key` and drops a stale result. `keyRef` and `runRef` make a PDF that finishes after an edit, or after a newer Generate, get ignored. Old object URLs are revoked.
  - **Focus:** first blank on load, the first missing blank after a failed Generate, the previous stay's heading after Remove, and the results heading when the PDF is ready.
  - **Keyboard:** Enter moves between `.blank` fields and never submits from a typed field, radio or checkbox.
- `StayCard.tsx` renders one stay as the receipt sentence with blanks: name, rent, address, frequency, months and years, owner, PAN. Below that are the signature option, payment-mode radios, notes (`notesFor`) and the receipt count. Small inputs (`RentBlank`, `YearBlank`, `AddressBlank`) clean their value as you type.
- `Results.tsx` shows the receipts as the PDF lays them out, with the download link.
- `seed.ts` (`readPrerendered`) reads the pre-rendered form's fields by id before it's replaced, keeping only fields whose value differs from the pre-rendered default.

## The PDF (`src/pdf/`)

- `generate.ts` is the lazy entry point (dynamic `import()` in `App.tsx`). It bundles the three Inter subsets with `?inline` (a base64 string in the script, decoded to bytes), because the CSP forbids fetching them.
- `layout.ts` (`renderReceipts`) draws A4 pages with two receipts each and a dashed cut line only when the lower half is used. `wrap()` does word wrap across mixed-weight runs and breaks over-long words. Coordinates are points from the top-left.
- `canvas.ts` is the minimal drawing interface: `text`, `line`, `rect`, `width`, `addPage`, `save`. `writer.ts` implements it: a dependency-free PDF writer that embeds the build-time font subsets whole (Type0/Identity-H fonts with a ToUnicode map, so text copies and extracts exactly; uncompressed streams). Tests use a fake canvas, and read real output back with LibPDF (a dev dependency). `scripts/sample-receipt.ts` uses a half-page canvas to render the sample image.

## Build (`vite.config.ts`, `package.json`)

`npm run build` runs `tsc --noEmit`, then `vitest run`, then `vite build`:
- **`csp-meta`** injects the CSP `<meta>` first in `<head>`.
- **`prerender-form`** starts a throwaway Vite SSR server, renders `<App />` with `preact-render-to-string`, and inserts it after the `<noscript>` note in `<main id="tool">`. The form is therefore in the HTML for crawlers and the first paint. It's rendered with the build date and replaced on load, not hydrated (see [gotchas](gotchas.md#pre-rendering)).
- Output: `index.html`, one entry chunk (Preact and the app, about 15 KB gzip), one lazy `generate-*.js` (the writer and fonts, about 50 KB gzip), and the CSS. Web fonts are hashed into `dist/assets/`. Files in `public/` are copied as they are.
- `modulePreload.polyfill` is off (it would `fetch`), `assetsInlineLimit` is 0 (no `data:` URLs), and `chunkSizeWarningLimit` sits just above the PDF chunk's size.

## Hosting and deploy

- `wrangler.jsonc` sets up a Cloudflare Worker with static assets only, serving `dist/` on the custom domain. `workers_dev` is off and branch preview URLs are on.
- `public/_headers` sets the CSP and other security headers for every path, and a year-long immutable cache for `/assets/*` (hashed files). Everything else revalidates.
- **Deploy:** a push to `main` triggers Cloudflare Workers Builds (Node from `.nvmrc`), which runs the build (tests included) and publishes. A new version is usually live about a minute after the push. `npm run deploy` deploys by hand.

## Static content and discovery

- `index.html` holds:
  - the handwritten headline (Caveat, subset to its own characters);
  - the intro and link row;
  - "What else your employer may ask for";
  - the footer;
  - the three `<dialog>`s (`#why`, `#how`, `#format`). Their text sits in the HTML so crawlers can index it, and `main.tsx` shows the link row only once the dialogs work.
- Discovery files: JSON-LD (`WebApplication`), Open Graph and Twitter tags (`public/og.png`), `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/site.webmanifest` and icons.

## Generated files (committed)

| Output | Made by | From |
|---|---|---|
| `src/assets/fonts/web/*.woff2`, `src/assets/fonts/pdf/*.ttf` | `npm run fonts` | `fonts/source/`, `src/lib/charset.ts`, the headline text in the script |
| `public/sample-receipt.png` | `npm run sample` (macOS `sips`) | the real PDF code |
| `public/og.png`, `public/apple-touch-icon.png`, `public/icon-*.png` | `npm run og` (installed Chrome) | `og/og.html`, `public/favicon.svg` |
