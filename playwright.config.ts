import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (`vite preview`), so the CSP meta tag is active.
// Chromium uses the installed Google Chrome; Firefox and WebKit need `npx playwright install firefox webkit`.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4175' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chrome-phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-phone', use: { ...devices['iPhone 15'] } },
  ],
});
