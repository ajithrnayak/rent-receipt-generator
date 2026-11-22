import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (`vite preview`), so the CSP meta tag is active.
// Chromium uses the installed Google Chrome; Firefox and WebKit need `npx playwright install firefox webkit`.
// Set BASE_URL to test a deployed site instead, e.g. BASE_URL=https://rent-receipt-generator.ajith.xyz npx playwright test
const live = process.env.BASE_URL;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  use: { baseURL: live ?? 'http://localhost:4175' },
  webServer: live
    ? undefined
    : {
        command: 'npx vite build && npx vite preview --port 4175 --strictPort',
        url: 'http://localhost:4175',
        reuseExistingServer: false,
        timeout: 60_000,
      },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chrome-phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    // A very narrow phone (320 px wide) to catch horizontal scrolling.
    { name: 'chrome-small', use: { ...devices['Galaxy S9+'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-phone', use: { ...devices['iPhone 15'] } },
  ],
});
