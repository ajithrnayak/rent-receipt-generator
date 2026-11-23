import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated WCAG 2.2 AA checks (axe) on every state of the page.
async function scan(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+05:30'));
});

test('accessibility: empty, filled, errors, results and dialog', async ({ page }) => {
  await page.goto('/');
  await scan(page, 'empty page');

  await page.getByRole('button', { name: /^Generate/ }).click();
  await scan(page, 'missing blanks highlighted');

  await page.getByLabel('Your name').fill('Priya Raghavan');
  await page.getByLabel('Monthly rent in rupees').fill('28000');
  await page.getByLabel('House address').fill('14, 2nd Cross, Indiranagar, Bengaluru 560038');
  await page.getByLabel('House owner’s full name').fill('K. S. Venkatesh');
  await page.getByLabel('Add a signature line and revenue-stamp box').check();
  await page.getByRole('radio', { name: 'Cash' }).check();
  await page.getByRole('button', { name: '+ Add another stay' }).click();
  await scan(page, 'two stays with notes');

  const second = page.locator('section.stay').nth(1);
  await second.getByLabel('Monthly rent in rupees').fill('30000');
  await second.getByLabel('House address').fill('22 Lake View Road, Koramangala, Bengaluru 560034');
  await second.getByLabel('House owner’s full name').fill('R. Shankar');
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByRole('heading', { name: /ready as one PDF/ })).toBeVisible();
  await page.waitForTimeout(1200); // let the slide-in finish so colours are final
  await scan(page, 'results');

  await page.getByRole('button', { name: 'Why use this?' }).click();
  await scan(page, 'Why dialog');
});

test('keyboard only: fill, generate and download without a mouse', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit skips buttons and links on Tab unless macOS "keyboard navigation" is on');
  await page.goto('/');
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.keyboard.type('Priya');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12000');
  await page.keyboard.press('Tab');
  await page.keyboard.type('14, 2nd Cross, Bengaluru 560038');
  // Tab through the period menus and the Fill links to the owner.
  const owner = page.getByLabel('House owner’s full name');
  for (let i = 0; i < 12 && !(await owner.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(owner).toBeFocused();
  await page.keyboard.type('K. S. Venkatesh');
  // On to Generate.
  const generate = page.getByRole('button', { name: /^Generate/ });
  for (let i = 0; i < 12 && !(await generate.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(generate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /ready as one PDF/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Download PDF' }).first()).toBeFocused();
});
