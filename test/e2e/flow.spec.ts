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

  await page.getByRole('button', { name: 'One a quarter' }).click();
  await expect(page.getByText('3 receipts, one a quarter')).toBeVisible();
  await page.getByLabel('Add a signature line and revenue-stamp box').check();
  await page.getByRole('button', { name: 'Cash' }).click();
  await expect(page.getByText('put a ₹1 revenue stamp on each receipt')).toBeVisible();

  await page.getByRole('button', { name: 'Generate 3 receipts' }).click();
  await expect(page.getByRole('heading', { name: '3 receipts, ready as one PDF' })).toBeFocused();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).click()]);
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
  await page.getByRole('button', { name: 'Last financial year' }).click();
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
  await second.getByRole('button', { name: 'One a quarter' }).click();
  await expect(second.getByText('The November 2026 receipt will be dated 1 December 2026')).toHaveCount(0);
  await expect(second.getByText('November’s receipt will be dated 1 December 2026')).toBeVisible(); // a one-month quarter reads the same
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

test('the page cannot send data anywhere: fetch is blocked by the CSP', async ({ page }) => {
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
