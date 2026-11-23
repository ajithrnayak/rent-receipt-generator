# Testing

## Layers

| Layer | Where | Runs with | Covers |
|---|---|---|---|
| Unit | `test/*.test.ts` | `npm test`, and inside `npm run build` | Dates and periods (`months`), money and words (`money`), receipts, ordering and PAN totals (`receipts`), card notes and `problemOf` (`notes`), PDF layout with a fake canvas, and the PDF writer checked by an independent reader (LibPDF): glyphs, widths, text round trip, pages; fonts and charset (`pdf`), CSP header vs meta (`csp`) |
| Browser flows | `test/e2e/flow.spec.ts` | `npm run test:e2e` | The real build under its CSP: fill, Generate, download and read back the PDF text; notes; dialogs; and one regression test per fixed bug |
| Accessibility | `test/e2e/a11y.spec.ts` | `npm run test:e2e` | axe (WCAG 2.2 AA) on every state, and a keyboard-only fill-and-download |

The browser tests build the site and serve it with `vite preview` on :4175 (`playwright.config.ts`). The projects are Chrome (desktop, Pixel 7, and a 320 px Galaxy S9+), Firefox, WebKit (desktop and iPhone 15). Set `BASE_URL` to run them against a deployed site instead, e.g. production after a deploy.

## Running

```sh
npm test                                   # unit, fast
npx playwright test --project=chrome       # one browser while iterating
npm run test:e2e                           # all browsers
BASE_URL=https://rent-receipt-generator.ajith.xyz npm run test:e2e   # against production
```

In Claude Code's sandbox, Chrome and WebKit run fine but Firefox can't start. Run `--project=firefox` with the sandbox disabled (ask the user first), or have the user run it in a terminal.

## Conventions

- **Fix the clock.** `page.clock.setFixedTime(...)` in `beforeEach`: 22 Nov 2026 in `flow.spec.ts`, 23 Nov in `a11y.spec.ts`. Notes and defaults depend on "today".
- **Find elements the way people do:** `getByRole` and `getByLabel` with the visible or sr-only names, not CSS classes, except where a test is about markup (ids that `seed.ts` reads, `.count`).
- **After an axe scan, use `getByRole`, not `getByLabel`.** The latter crashes Playwright's Firefox on this page (see [gotchas.md](gotchas.md#tests)).
- **Fail on console errors** where it matters: `watch(page)` collects errors and CSP violations, then `expect(problems).toEqual([])`.
- **Read the PDF back:** `pdfText(path)` loads a downloaded PDF with LibPDF and returns its text with whitespace flattened. Assert on phrases, not layout.
- **Simulate a slow network** with `hold(page, pattern)`: it holds matching requests until you call the returned `release()`.
- **Every bug fix gets a regression test,** named for the behaviour, e.g. "a pasted PAN with spaces keeps all 10 characters".
- **Unit tests for rules:** when you change `src/lib/`, add `it.each` rows to the matching `test/*.test.ts`. Keep exact user-facing strings asserted where the wording matters.

## Before calling UI work done

1. `npm run build` passes (typecheck, unit tests, build).
2. The browser tests pass in Chrome and WebKit, and Firefox has been run, or the user has been asked to run it.
3. Screenshots at 1280 px and 390 px wide (and 320 px for anything that could overflow) have been looked at, not just taken. Use a throwaway spec or script, and delete it afterwards.
4. If the wording, fonts or receipt layout changed, `npm run sample` and `npm run og` have been run and the PNGs checked.
