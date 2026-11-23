# AGENTS.md

Instructions for coding agents (and people) working on this repo. The README tells the product story; this file says how to change the code without breaking its promises. Read it fully before your first change, then the doc for the area you're touching.

## Docs

| Read | When |
|---|---|
| [docs/architecture.md](docs/architecture.md) | You need the big picture: data model, UI state, PDF pipeline, build and pre-render, hosting and deploy, generated files |
| [docs/gotchas.md](docs/gotchas.md) | **Before changing build config, the pre-rendered form, inputs, the PDF, CSS or tests.** Traps already hit, with fixes |
| [docs/decisions.md](docs/decisions.md) | Before reversing a design choice (no server, CSP, our own PDF writer, pre-render, dialogs…) |
| [docs/rules.md](docs/rules.md) | You're touching receipt wording, dates, periods, PAN or revenue-stamp logic |
| [docs/testing.md](docs/testing.md) | You're writing or running tests, or about to call work done |

## What this is

A free rent receipt generator for HRA, live at https://rent-receipt-generator.ajith.xyz. It is static files only: Preact + TypeScript built by Vite, with PDFs drawn in the browser by our own small, dependency-free writer (`src/pdf/writer.ts`). It is served by a Cloudflare static-assets Worker (`wrangler.jsonc`, no Worker script). There is no server, no account and no storage: what someone types exists only in their tab.

## Non-negotiables

These are the product. Don't trade them away for a feature; stop and ask if a task seems to need it.

- **No network access, ever.** No `fetch`/XHR/WebSocket/beacon, analytics, error reporting, third-party scripts, CDN fonts or remote images. The CSP has `connect-src 'none'`, and everything else is `'self'` only.
- **The CSP exists twice and must match:** `CSP` in `vite.config.ts` (injected as a meta tag at build) and `public/_headers` (production header, plus `frame-ancestors 'none'`). `test/csp.test.ts` fails if they drift.
- **No inline styles or scripts in markup.** No `style=""` attributes and no `<style>` blocks. Setting `element.style` from script (CSSOM) is allowed. JSON-LD is data, so it's fine.
- **No `data:` URLs.** `img-src 'self'`, `font-src 'self'`, and `build.assetsInlineLimit: 0`. The deliberate exception: the PDF fonts are `?inline` imports in `src/pdf/generate.ts`. They are bytes inside the script, not URLs, because the code can't `fetch`.
- **Nothing on the PDF but the receipts:** no credit, link, logo or site address, in the page content or the file properties (the writer sets only a Title and creation date). `test/pdf.test.ts` checks both.
- **The PDF code stays lazy:** `src/pdf/generate.ts` (the writer and the three fonts, about 50 KB gzip) loads only once someone types or presses Generate. A test checks it isn't fetched on page load.

## Commands

Node 22.18+ (`.nvmrc` says 22; scripts run `.ts` files directly with Node's type stripping).

| Command | Does |
|---|---|
| `npm install` | Install |
| `npm run dev` | Dev server. **No CSP in dev**: always check behaviour in a build too |
| `npm run build` | `tsc --noEmit`, then unit tests, then `vite build` into `dist/`. A failing test stops the build, and so the deploy |
| `npm run preview` | Serve `dist/` with the CSP meta tag. Restart it after every rebuild |
| `npm test` | Unit tests only (Vitest) |
| `npm run check` | Type-check only |
| `npm run test:e2e` | Playwright: builds, serves on :4175, runs Chrome, Firefox and WebKit, desktop and phone |
| `BASE_URL=https://rent-receipt-generator.ajith.xyz npm run test:e2e` | Same browser tests against the live site |
| `npm run fonts` | Re-subset Inter and Caveat after changing `src/lib/charset.ts` or the handwritten headline |
| `npm run sample` | Re-render `public/sample-receipt.png` from the real PDF code (macOS: uses `sips`) |
| `npm run og` | Re-render `public/og.png` from `og/og.html`, and the PNG icons (uses installed Chrome) |
| `npm run deploy` | Build and `wrangler deploy` by hand. Normally unnecessary: pushes to `main` deploy |

## Where things are

- `src/lib/`: pure, unit-tested logic (months as integers, money, receipts, notes, wording, charset).
- `src/pdf/`: the lazy PDF chunk (layout behind a small `Canvas` interface, drawn by `writer.ts`). `@libpdf/core` is a dev dependency only: tests use it to read our PDFs back.
- `src/app/`: the Preact UI.
- `src/main.tsx`: mounting and the dialogs.
- `index.html`: static content and the three dialogs.
- `vite.config.ts`: the CSP and the build-time pre-render.
- `scripts/`: generators for committed assets.
- `spike/`: a historical record; don't update it.

Details are in [docs/architecture.md](docs/architecture.md).

## Change recipes

**Receipt wording.** `src/lib/wording.ts` (`wordingOf`, `FIXED`) drives the PDF and the on-page preview. Update these by hand too:
1. the form sentence in `src/app/StayCard.tsx` (the form *is* the receipt);
2. the sample image's `alt` in `index.html`;
3. the receipt in `og/og.html`.

Then run `npm run sample` and `npm run og` and look at both PNGs. Tests in `test/pdf.test.ts` and `test/e2e/flow.spec.ts` assert on exact phrases. Check [docs/rules.md](docs/rules.md) still matches.

**Characters the PDF can print.** Edit `src/lib/charset.ts`, run `npm run fonts`, then `npm test` (a test checks every printable character has a glyph in each subset). Text outside the set is caught by `problemOf` (`src/lib/notes.ts`), which blocks Generate.

**Form fields.** `App` is pre-rendered at build time (with the build date) and replaced on load, so:
- it must render without `window` or `document` at module or render time;
- `src/app/seed.ts` reads these first-stay ids to keep anything typed before the script loaded. Keep them stable, or update `seed.ts` and its tests: `tenant`, `rent-1`, `addr-1`, `owner-1`, `pan-1`, `freq-1`, `from-1-m`, `from-1-y`, `till-1-m`, `till-1-y`, `sign-1`.

Enter moves between `.blank` fields and never submits from a typed field (`onKeyDown` in `App.tsx`).

**Rules and notes.** `src/lib/receipts.ts` and `src/lib/notes.ts`, unit-tested in `test/receipts.test.ts` and `test/notes.test.ts`. E2E tests match some note text exactly. Update [docs/rules.md](docs/rules.md) with the change.

**Static content and dialogs.** Edit `index.html`. A new dialog needs a button with `data-open="<dialog id>"` in `.intro-links`; `main.tsx` wires it up. Keep the padding on `.dialog-inner`, not on the `<dialog>`.

**Security headers.** Change both CSP copies and `test/csp.test.ts` together. Other headers live only in `public/_headers`.

## Testing essentials

Full guide: [docs/testing.md](docs/testing.md).

- Run `npm run build` (typecheck plus unit tests) after every change, and the browser tests before calling work done.
- Every bug fix gets a regression test. E2E tests fix the clock; do the same.
- **Claude Code's sandbox:** Chrome and WebKit run fine. Playwright's Firefox can't start inside it. Run Firefox with the sandbox disabled after asking the user, or ask them to run `npx playwright test --project=firefox`.
- After an axe scan, find fields with `getByRole`, not `getByLabel`: the latter crashes Playwright's Firefox on this page.
- For UI changes, look at screenshots at 1280 px and 390 px before saying it's done.

## Accessibility and copy

- WCAG 2.2 AA: axe runs on every state in `test/e2e/a11y.spec.ts`. Labels are mostly `sr-only` because the receipt sentence is the visible label; keep both in step. Manage focus after anything that moves or removes content. Targets are at least 44 px on coarse pointers.
- Copy is plain Indian English:
  - `lang="en-IN"`, "licence", "financial year", "owner" (not "landlord"), "stay" for one home/owner/rent period;
  - curly ’ “ ” in UI and PDF text;
  - ₹ with Indian grouping via `formatINR`.
- It's guidance, not tax advice. Don't add legal claims beyond [docs/rules.md](docs/rules.md) without a source.

## Git and deploy

- **A push to `main` deploys to production** (Cloudflare Workers Builds runs the build, unit tests included; browser tests aren't). Don't push without the user's go-ahead; commit locally and ask. Other branches get preview URLs.
- Commit messages: a short descriptive subject, then a bullet body when there's more than one change (see `git log`).
- Never commit `dist/`, `test-results/`, `.wrangler/` or secrets (all ignored).
- Keep these docs true: if a change makes a statement in `AGENTS.md` or `docs/` wrong, fix the doc in the same commit.
