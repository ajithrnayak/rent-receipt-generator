import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDF } from '@libpdf/core';

// Fix "today" so periods and notes are stable: 22 November 2026.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T10:00:00+05:30'));
});

/** Fails the test on any CSP violation or page error. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

async function pdfText(path: string): Promise<string> {
  const pdf = await PDF.load(new Uint8Array(await readFile(path)));
  // Wrapped lines come back with line breaks; compare as one flowing text.
  return pdf.extractText().map((p) => p.text).join(' ').replace(/\s+/g, ' ');
}

test('fills one stay, quarterly with stamp boxes, and downloads a PDF', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/');

  // The cursor starts on the first blank; Enter moves to the next.
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.keyboard.type('Priya Raghavan');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Monthly rent in rupees')).toBeFocused();
  await page.keyboard.type('28000');
  await expect(page.getByText('(Rupees Twenty Eight Thousand only)')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Monthly rent in rupees')).toHaveValue('28,000');
  await page.keyboard.type('14, 2nd Cross, Indiranagar, Bengaluru 560038');
  await page.keyboard.press('Enter');
  await page.keyboard.type('K. S. Venkatesh');

  // Rent of ₹28,000 for Apr–Oct is over ₹1 lakh, so PAN is needed.
  await expect(page.getByPlaceholder('Needed')).toBeVisible();
  await page.getByPlaceholder('Needed').fill('abcpv1234k');
  await expect(page.getByPlaceholder('Needed')).toHaveValue('ABCPV1234K');

  await page.getByLabel('One receipt for every month or quarter').selectOption('quarterly');
  await expect(page.getByText('3 receipts, one a quarter')).toBeVisible();
  await page.getByLabel('Add a signature line and revenue-stamp box').check();
  await page.getByRole('radio', { name: 'Cash' }).check();
  await expect(page.getByRole('radio', { name: 'Cash' })).toBeChecked();
  await expect(page.getByText('put a ₹1 revenue stamp on each receipt')).toBeVisible();

  await page.getByRole('button', { name: 'Generate 3 receipts' }).click();
  await expect(page.getByRole('heading', { name: '3 receipts, ready as one PDF' })).toBeFocused();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).first().click()]);
  expect(download.suggestedFilename()).toBe('rent-receipts-apr-2026-to-oct-2026.pdf');
  const text = await pdfText((await download.path())!);
  expect(text).toContain('April – June 2026');
  expect(text).toContain('₹84,000');
  expect(text).toContain('Rupees Eighty Four Thousand only');
  expect(text).toContain('1 April 2026 to 30 June 2026');
  expect(text).not.toContain('a month'); // total only (agreed 2026-11-22)
  expect(text).not.toMatch(/ajith|made by/i); // no credit on the receipts
  expect(text).toContain('Date: 1 July 2026');
  expect(text).toContain('October 2026'); // the last quarter is cut to the stay
  expect(text).toContain('Mode of payment');
  expect(text.indexOf('April – June')).toBeLessThan(text.indexOf('July – September'));

  expect(problems).toEqual([]);
});

test('highlights missing blanks and moves to the first', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Priya');
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByRole('alert')).toContainText('monthly rent, address, owner’s name');
  await expect(page.getByLabel('Monthly rent in rupees')).toBeFocused();
  expect(problems).toEqual([]);
});

test('a second stay continues the months and flags overlaps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'last financial year' }).click();
  await page.getByRole('button', { name: '+ Add another stay' }).click();
  const second = page.locator('section.stay').nth(1);
  await expect(second.getByLabel('From month')).toHaveValue('3'); // April
  await expect(second.getByLabel('From year')).toHaveValue('2026');
  await second.getByLabel('From year').selectOption('2025');
  await expect(page.getByText('Apr 2025 also appears in Stay 1')).toBeVisible();
});

test('a stay reaching this month says its receipt is dated in the future', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add another stay' }).click(); // November 2026 only
  await expect(page.getByText('November’s receipt will be dated 1 December 2026. Make it once you’ve paid, or end this stay at Oct 2026.')).toBeVisible();
  const second = page.locator('section.stay').nth(1);
  await second.getByLabel('One receipt for every month or quarter').selectOption('quarterly');
  await expect(second.getByText('The November 2026 receipt will be dated 1 December 2026')).toHaveCount(0);
  await expect(second.getByText('November’s receipt will be dated 1 December 2026')).toBeVisible(); // a one-month quarter reads the same
});

test('the PAN note appears once, however many stays need it', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Monthly rent in rupees').fill('28000');
  await page.getByRole('button', { name: '+ Add another stay' }).click();
  await page.locator('section.stay').nth(1).getByLabel('Monthly rent in rupees').fill('30000');
  await expect(page.getByText('so your employer will ask for the owner’s PAN')).toHaveCount(1);
  await expect(page.getByPlaceholder('Needed')).toHaveCount(2);
});

test('the Why dialog opens, closes on Escape and returns focus', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Why use this?' });
  await open.click();
  await expect(page.getByRole('dialog', { name: 'Why use this?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(open).toBeFocused();
});

test('the CSP blocks fetch: the page has no way to upload what you type', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    try {
      await fetch('/robots.txt');
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  expect(result).toBe('blocked');
});

test('the PDF code loads only once someone types, not on page load', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(scripts.some((s) => s.includes('generate'))).toBe(false);
  await page.getByLabel('Your name').fill('P');
  await expect.poll(() => scripts.some((s) => s.includes('generate'))).toBe(true);
});

test('a partial PAN is flagged after Generate', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Owner’s PAN, optional').fill('ABCP12');
  await expect(page.getByText('That PAN doesn’t look right')).toBeHidden();
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByText('That PAN doesn’t look right')).toBeVisible();
});

test('no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add another stay' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

async function fillStay(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Monthly rent in rupees').fill('28000');
  await page.getByLabel('House address').fill('14, 2nd Cross, Indiranagar, Bengaluru 560038');
  await page.getByLabel('House owner’s full name').fill('K. S. Venkatesh');
}

/** Holds back requests matching `pattern` until the returned function is called. */
async function hold(page: Page, pattern: RegExp): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test('an edit while the PDF is being made drops that PDF; the next one has the edit', async ({ page }) => {
  const release = await hold(page, /\/assets\/generate-[^/]*\.js$/); // a slow connection
  await page.goto('/');
  await fillStay(page, 'Priya');
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByRole('button', { name: 'Making your PDF…' })).toBeVisible();
  await page.getByLabel('Your name').fill('Priya Raghavan');
  release();
  await expect(page.getByRole('button', { name: /^Generate/ })).toBeEnabled();
  await page.waitForTimeout(500); // give the stale PDF time to (wrongly) show up
  await expect(page.getByRole('heading', { name: /ready as one PDF/ })).toHaveCount(0);

  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.locator('.slip-sentence').first()).toContainText('from Priya Raghavan the sum of');
});

test('a box ticked before the script loaded stays ticked, without errors', async ({ page }) => {
  const problems = watch(page);
  const release = await hold(page, /\/assets\/index-[^/]*\.js$/);
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('#sign-1').check(); // the checkbox ends up focused
  release();
  await expect(page.getByRole('button', { name: 'Why use this?' })).toBeVisible();
  await expect(page.getByLabel('Add a signature line and revenue-stamp box')).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Cash' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Enter on a pay-mode choice picks it, and on the checkbox does nothing; neither submits', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('Add a signature line and revenue-stamp box');
  await box.check();
  await box.focus();
  await page.keyboard.press('Enter');
  await expect(box).toBeChecked();
  const cash = page.getByRole('radio', { name: 'Cash' });
  await cash.focus();
  await page.keyboard.press('Enter');
  await expect(cash).toBeChecked();
  await expect(cash).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('what was typed before the script loaded is kept, with the cursor', async ({ page }) => {
  const release = await hold(page, /\/assets\/index-[^/]*\.js$/);
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('#tenant').fill('Priya Raghavan'); // the pre-rendered form
  await page.locator('#from-1-m').selectOption('5'); // June
  await page.locator('#owner-1').fill('K. S. Venkatesh');
  release();
  await expect(page.getByRole('button', { name: 'Why use this?' })).toBeVisible(); // the script has run
  await expect(page.getByLabel('Your name')).toHaveValue('Priya Raghavan');
  await expect(page.getByLabel('House owner’s full name')).toHaveValue('K. S. Venkatesh');
  await expect(page.getByLabel('House owner’s full name')).toBeFocused();
  await expect(page.getByLabel('From month')).toHaveValue('5');
  await expect(page.getByLabel('Till month')).toHaveValue('9'); // untouched: today's default (Oct 2026)
});

test('names the PDF cannot print stop Generate and are highlighted', async ({ page }) => {
  await page.goto('/');
  await fillStay(page, 'प्रिया');
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByRole('alert')).toContainText('Please retype in English: your name');
  await expect(page.getByLabel('Your name')).toBeFocused();
  await expect(page.getByRole('heading', { name: /ready as one PDF/ })).toHaveCount(0);
});

test('the Why dialog stays open on a click inside it and closes on the backdrop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Why use this?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Why use this?' });
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2); // the card's edge, inside it
  await expect(dialog).toBeVisible();
  await page.mouse.click(box.x + box.width / 2, Math.max(2, box.y - 10)); // the backdrop above it
  await expect(dialog).toBeHidden();
});

test('a pasted PAN with spaces keeps all 10 characters', async ({ page }) => {
  await page.goto('/');
  const pan = page.getByLabel('Owner’s PAN, optional');
  await pan.focus();
  await page.keyboard.insertText('abcpv 1234 k');
  await expect(pan).toHaveValue('ABCPV1234K');
  await page.keyboard.insertText('ZZ');
  await expect(pan).toHaveValue('ABCPV1234K');
});

test('removing a stay moves focus to the stay before it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add another stay' }).click();
  await page.getByRole('button', { name: 'Remove stay 2' }).click();
  await expect(page.locator('section.stay')).toHaveCount(1);
  await expect(page.locator('#stay-1-title')).toBeFocused();
});

test('a long name stays inside the card', async ({ page }) => {
  await page.goto('/');
  const owner = page.getByLabel('House owner’s full name');
  await owner.fill('Sri Venkata Lakshmi Narasimha Rao Chowdary Kondapalli Family Trust of Bengaluru');
  const spill = await owner.evaluate((el) => {
    const paper = el.closest('.paper')!;
    const inner = paper.getBoundingClientRect().right - parseFloat(getComputedStyle(paper).paddingRight);
    return el.getBoundingClientRect().right - inner;
  });
  expect(spill).toBeLessThanOrEqual(0.5);
});

test('crawlers and first paint get the receipt without JavaScript; the sample receipt loads', async ({ page, request }) => {
  // The raw HTML (no JavaScript run) already holds the receipt form and the format section.
  const html = await (await request.get('/')).text();
  expect(html).toContain('Received with thanks from');
  expect(html).toContain('Rent receipt format');
  await page.goto('/');
  const img = page.getByRole('img', { name: /A sample rent receipt/ });
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
});
