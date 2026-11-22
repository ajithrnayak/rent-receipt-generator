// Renders og/og.html to public/og.png (1200 × 630) for link previews. Run: npm run og
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('og/og.html', root).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL('public/og.png', root)) });
await browser.close();
console.log('public/og.png written');
