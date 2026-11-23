# Receipt rules

The rules the generator implements, and where. This is what the code does, not tax advice. The guidance comes from the Indian Stamp Act, 1899 (Schedule I, Article 53) and income-tax guidance on HRA. Rules and employer practice change; the site tells people to check with their employer or the [Income Tax Department's portal](https://www.incometax.gov.in/).

When a rule changes, change the code, its unit tests and this page together.

## Stays

A **stay** is one home, owner and monthly rent over a run of months: one card on the page (`Stay` in `src/lib/receipts.ts`). Moving house, changing owner or a change of rent means another stay. A new stay starts the month after the previous one ends and keeps its frequency, signature setting and payment mode (`reducer`, `'add'`, in `src/app/state.ts`).

Months are whole months only. They start on the current financial year by default: From is April of the current financial year, To is last month, but never before April (`today()` in `src/app/state.ts`). Years are typed and accept 1900–2099 (`parseYear` in `src/lib/months.ts`).

## Periods

- **Monthly:** one receipt per month.
- **Quarterly:** financial-year quarters, April–June, July–September, October–December and January–March, cut to the stay's months. A stay from May to October gives May–June, July–September and October (`periodsOf`).
- The financial year runs April to March (`fyStartOf`, `fyLabel`, e.g. "2026-27").

## What a receipt says

`wordingOf` in `src/lib/wording.ts`:

> **RENT RECEIPT** No. *n* · *title* · Date: *receipt date*
>
> Received from *tenant* the sum of ₹*amount* (*amount in words*) towards rent for the property at *address*, for the period *1 April 2026* to *30 June 2026*.
>
> Received by *owner* · Owner’s PAN *(if given)* · Mode of payment *(only with the signature boxes)*

- **Amount** = monthly rent × months in the period (`buildReceipts`).
- **Period:** from the 1st of the first month to the real last day of the last month, leap years included (`spanOf`, `daysIn`).
- **Receipt date:** the 1st of the month after the period. A period ending in March is dated 31 March instead, so the receipt stays inside the financial year (`receiptDateOf`).
- **Money:** whole rupees with Indian digit grouping (₹1,96,000), and in words in the Indian system, e.g. "Rupees One Lakh Twenty Five Thousand only" (`formatINR`, `amountInWords` in `src/lib/money.ts`). Rent is limited to 9 digits (`cleanRent`).
- **Signature line and ₹1 revenue-stamp box:** only when the stay asks for them, together with the payment mode: bank transfer / UPI, cheque or cash.

## Order and numbering

All receipts from all stays go into one PDF in strict date order. Receipts that start in the same month keep the stays' order. They are numbered 1, 2, 3… after sorting (`buildReceipts`). The PDF is A4 with two receipts per page and a dashed cut line between them (`renderReceipts` in `src/pdf/layout.ts`).

## Owner's PAN

- Needed when **total rent in a financial year, across all stays, is over ₹1,00,000** (`PAN_THRESHOLD`, `panNeeded`, `rentByFinancialYear`). It's a strict "over": exactly ₹1,00,000 doesn't need it.
- This is the stricter reading. The sources don't settle whether the limit is per owner or per tenant across owners, so the tool totals every stay.
- A stay that touches two financial years is judged by the worse of the two.
- The note explaining it appears once on the page, on the first stay that needs a PAN and doesn't have one. Every stay that needs one shows "Needed" in its PAN blank.
- Format: five letters, four digits, a letter (`PAN_PATTERN`). Input is upper-cased and cleaned to letters and digits, at most 10 (`cleanPan`). A malformed PAN is flagged once 10 characters are typed, or after Generate.

## Revenue stamp

- A receipt **over ₹5,000** carries a ₹1 revenue stamp, signed across by the owner (Indian Stamp Act, 1899, Schedule I, Article 53; `STAMP_THRESHOLD`).
- The advice depends on how rent was paid (`stampAdvice` in `src/lib/notes.ts`), judged on the largest single receipt (a quarter counts as one receipt; `largestReceipt`):
  - ₹5,000 or less: no stamp needed; a signature still helps.
  - Cash over ₹5,000: put a ₹1 stamp on each receipt and have the owner sign across it.
  - Bank transfer / UPI or cheque over ₹5,000: the Act still asks for the stamp, but many employers accept a bank statement instead; check with yours.

## Checks on the form

From `notesFor` and `problemOf` in `src/lib/notes.ts`, and `App.tsx`:

- **Blocks Generate:** an empty name, rent, address or owner, or text the PDF fonts can't print (anything outside `src/lib/charset.ts`; in practice, non-Latin scripts and emoji). The field is highlighted and focused.
- **Warns:**
  - End month before start month: no receipts from that stay.
  - Months shared with another stay: fine if two rents were paid that month.
  - Months after the current month: receipts are for rent already paid.
  - The current month: its receipt will be dated in the future (the 1st of next month).

## What else employers ask for

From the "What else your employer may ask for" section of `index.html`:
- the HRA declaration (Form 124 from April 2026, Form 12BB before that);
- a rent agreement;
- the owner's PAN if rent is over ₹1 lakh in a financial year;
- bank statements if rent was paid online.
