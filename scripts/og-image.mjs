// Renders the link-preview image and the PNG icons with Chrome:
//   og/og.html        → public/og.png (1200 × 630)
//   public/favicon.svg → public/apple-touch-icon.png (180), public/icon-192.png, public/icon-512.png
// Run: npm run og
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const browser = await chromium.launch({ channel: 'chrome' });

const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.goto(new URL('og/og.html', root).href);
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: path('public/og.png') });

// Icons: the favicon on the page background, with some padding (iOS shows icons on their own tile).
const svg = readFileSync(path('public/favicon.svg'), 'utf8');
for (const [size, file] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#EEF0F3">
    <div style="width:${Math.round(size * 0.72)}px;height:${Math.round(size * 0.72)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: path(`public/${file}`) });
  await page.close();
}
await browser.close();
console.log('public/og.png and icons written');
