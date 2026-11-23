# Gotchas

Traps this codebase has already hit, or is built to avoid. Each is a symptom, its cause and what to do. Add to this list when you hit a new one.

## Build, CSP and serving

- **Works in `npm run dev`, broken in the build.** The CSP is only in the build (the `csp-meta` plugin is `apply: 'build'`), so dev allows inline styles, `data:` URLs and `fetch`. Check anything touching styles, assets or network in `npm run build && npm run preview`. The e2e tests always run against a build.
- **`vite preview` after a rebuild.** Restart it after `npm run build`, so it serves the new `dist/` with its new hashed file names.
- **An asset silently becomes a `data:` URL and is blocked.** Vite inlines small assets unless `assetsInlineLimit` is 0, and the CSP has no `data:`. Keep it at 0. `?inline` imports (the PDF fonts) are the deliberate exception and are bytes in the script, not URLs.
- **A `style` attribute is blocked by the CSP.** `style-src 'self'` forbids `style=""` in markup, including pre-rendered markup. Setting `element.style` from script (CSSOM) is allowed: `Results.tsx` (animation delay) and `AddressBlank` (height) do it. Never render a style attribute into the pre-rendered HTML.
- **`modulePreload` polyfill.** It `fetch`es modules, which `connect-src 'none'` blocks, so it's turned off. Every supported browser has native modulepreload.
- **Font preload fetched twice.** The `<link rel="preload">` hrefs in `index.html` must resolve to the same hashed files as the `@font-face` URLs in `styles.css`. Both point into `src/assets/fonts/web/`, and Vite rewrites both. Check `dist/index.html` after moving fonts.

## Pre-rendering

- **The form in the HTML shows the build date.** `prerender-form` renders `<App />` when the build runs, so its months, years and "Generate N receipts" reflect the build day. On load, `main.tsx` replaces it with a live render. Don't switch to `hydrate()` without handling that: the build-time and real dates differ, and the pre-rendered values would have to be corrected after hydration.
- **`App` must render in Node.** No `window`, `document` or `localStorage` at module level or during render; use effects. The build fails (or renders wrong markup) otherwise.
- **Text typed before the script loads.** It would be wiped when the live form replaces the pre-rendered one. `readPrerendered` (`src/app/seed.ts`) reads the first stay's fields by id and keeps only changed ones: `value !== defaultValue`, `!defaultSelected`, `checked !== defaultChecked`. Untouched month menus hold build-time values and must not be copied. Renaming those ids breaks this silently; the e2e tests "what was typed before the script loaded…" catch it.
- **Restoring focus to a checkbox throws.** `setSelectionRange` only works on text fields. `App.tsx` checks the element type first.

## Inputs (Preact)

- **A cleaned value doesn't show.** If a keystroke is dropped by cleaning (a letter in Rent, a space in PAN), state doesn't change, so Preact doesn't re-render and the stray character stays on screen. `RentBlank`, the PAN input and `YearBlank` write `el.value` back themselves when the cleaned text differs.
- **`maxLength` truncates a paste before cleaning.** Pasting `ABCPV 1234 K` into `maxLength={10}` loses the last letter. Clean and cap in code (`cleanPan`, `slice(0, 4)` for years) instead.
- **Rent is formatted only when not focused.** While focused it shows raw digits, so the cursor doesn't jump around commas.
- **Enter submits forms in surprising places:** text inputs, radios and checkboxes all do implicit submission. `onKeyDown` in `App.tsx` stops it. Enter on `.blank` moves to the next blank, on a radio it picks it, and on the checkbox and year boxes it does nothing. It also skips the Enter that confirms an IME composition (`isComposing` or `keyCode === 229`).
- **`enterKeyHint` on `<textarea>`:** Preact's types only accept the lowercase `enterkeyhint` there. Inputs take `enterKeyHint`.
- **The address is a `<textarea>` but single-line.** Newlines are replaced with ", ", and it auto-grows via `scrollHeight` on input and window resize.

## Generating the PDF

- **A PDF made from old data.** Generate is async (it may download the PDF chunk first). If the user edits while it runs, the result must be dropped: `keyRef` holds the latest inputs and `runRef` the latest run, and both are checked before showing a result. Revoke object URLs you replace.
- **Missing glyphs come out wrong, with no error.** The writer draws glyph 0 (.notdef, an empty box) for characters the font lacks; LibPDF before it turned a Devanagari name into garbage. The fonts are subset to `PRINTABLE_TEXT` (`src/lib/charset.ts`), and `problemOf` blocks Generate on anything outside it. Inter lacks U+00AD (soft hyphen) and U+0149, so the charset excludes them. After changing the charset, run `npm run fonts`.
- **Branding sneaks into the file.** The writer's Info dictionary has only a Title and CreationDate; don't add Producer/Creator naming the site. `test/pdf.test.ts` scans the raw bytes for the site address.
- **Changing the PDF fonts.** `parseFont` (`src/pdf/writer.ts`) reads `head`, `hhea`, `hmtx`, `OS/2` and a format 4 or 12 `cmap`, and embeds the file whole. Keep the fonts TrueType (`targetFormat: 'truetype'` in `scripts/subset-fonts.ts`) and subset, or the PDF grows by the font's full size.
- **Copying text out of the PDF maps glyphs back to characters.** The ToUnicode map is keyed by glyph, so two characters that share a glyph (a space and a pasted non-breaking space) copy back as whichever was drawn last. It's harmless here. Keep it in mind if exact copy-out ever matters.
- **Lenient PDF viewers hide structural mistakes.** Chrome, Firefox, macOS and LibPDF all repair a wrong xref offset or stream length silently; Acrobat doesn't. The structure test in `test/pdf.test.ts` checks them exactly; keep it passing when you touch `save()`.
- **Don't compress with `CompressionStream`.** It crashed Playwright's Firefox mid-test (after axe scans). Streams are written uncompressed on purpose (a year of receipts is about 136 KB); see [decisions.md](decisions.md#5-our-own-pdf-writer-loaded-lazily-fonts-inlined).
- **`formatINR` needs ICU data for `en-IN`.** Browsers and Node have it. A trimmed runtime would print Western grouping.

## Layout and CSS

- **Inline blanks spill out of the card.** Blanks grow with their text (`size`), and `.stay { overflow: hidden }` clips them. `.blank` has `max-width: calc(100% - 4px)` to allow for its 2px side margins. Full-width and phone variants use `max-width: 100%` because they have no side margins.
- **Focus styles lose to other states.** `.blank:not(:placeholder-shown)` and `.blank.miss` have the same specificity as `:focus`. The focus rule comes after them in `styles.css`; keep it there. Focus uses a transparent outline (visible in forced-colours mode) plus an inset shadow bar.
- **Clicking inside a dialog closes it.** Backdrop clicks are detected as `e.target === dialog`, which also matches clicks on the dialog's own padding. Keep `padding: 0` on `.dialog` and pad `.dialog-inner`.
- **The pay-mode chips are radios** with the real `<input>` stretched invisibly over each chip (`opacity: 0`, not `display: none`, so keyboard and screen readers still reach it). The checked and focus styles use `:has()`.
- **The sample image is lazy-loaded inside a closed dialog,** so it loads the first time the dialog opens. Keep `width` and `height` on it.

## Tests

- **Firefox won't start in Claude Code's sandbox** ("Could not find profile folder"). Run it with the sandbox disabled (ask first), or in a normal terminal.
- **Playwright's Firefox crashes ("Page crashed")** on `getByLabel()` after an axe scan on this page, triggered by the stay `<section aria-labelledby>`. Real Firefox isn't affected. In `a11y.spec.ts`, use `getByRole(…, { name })` after scans.
- **The accessibility test times out under load.** Six axe scans take a few seconds alone but passed 30 s in Firefox with every project running in parallel, so it's marked `test.slow()`.
- **WebKit doesn't Tab to buttons and links** unless macOS keyboard navigation is on, so the keyboard-only test skips WebKit.
- **Dates in assertions drift.** The e2e tests fix the clock (`page.clock.setFixedTime`). New tests that mention months need the same.
- **Simulating a slow network:** `hold(page, pattern)` in `flow.spec.ts` keeps a request pending until released. It's used to test the stale-PDF race (hold `generate-*.js`) and typing before the script loads (hold `index-*.js`).
- **`npm run sample` needs macOS** (`sips` converts PDF to PNG). **`npm run og` needs Google Chrome installed** (Playwright `channel: 'chrome'`).
