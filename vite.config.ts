/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * The privacy guarantee, enforced by the browser: scripts, styles and fonts only
 * from this site, and no network connections at all (connect-src 'none'), so even
 * a bug could not send what you type anywhere. Production sends the same policy as
 * a header (public/_headers); the meta copy makes `vite preview` and the browser
 * tests run under it too. (frame-ancestors only works as a header.)
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "manifest-src 'self'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  plugins: [cspMeta()],
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    // The polyfill would fetch() modules, which connect-src 'none' forbids; every target browser supports modulepreload.
    modulePreload: { polyfill: false },
    // Fonts for the PDF are imported with ?inline on purpose (no fetch needed).
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
