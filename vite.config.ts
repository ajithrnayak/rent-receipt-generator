/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * The privacy guarantee, enforced by the browser: scripts, styles, fonts and images
 * only from this site, and no fetch, XHR, WebSocket or beacon at all (connect-src
 * 'none'), so the page has no way to upload what you type. (CSP does not govern
 * every channel: a page could still navigate away with data in the URL, and WebRTC
 * is outside it. That is why the code itself never does either.) Production sends
 * the same policy as a header (public/_headers); the meta copy makes `vite preview`
 * and the browser tests run under it too. (frame-ancestors only works as a header.)
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
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

const JSX = { runtime: 'automatic', importSource: 'preact' } as const;

/**
 * Renders the form's starting state into index.html at build time, so crawlers and
 * the first paint see the receipt without waiting for JavaScript (and nothing jumps
 * when it mounts). In the browser, main.tsx replaces it with the live form, keeping
 * anything typed into it first (src/app/seed.ts). It goes after the <noscript> note,
 * so with JavaScript off the note is the first thing in the tool.
 */
function prerenderForm(): Plugin {
  return {
    name: 'prerender-form',
    apply: 'build',
    async transformIndexHtml(html) {
      const { createServer } = await import('vite');
      const { renderToString } = await import('preact-render-to-string');
      const { h } = await import('preact');
      const server = await createServer({
        configFile: false,
        logLevel: 'error',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false },
        oxc: { jsx: JSX },
      });
      try {
        const { App } = await server.ssrLoadModule('/src/app/App.tsx');
        const markup = renderToString(h(App, null));
        const slot = /<main id="tool">[\s\S]*?<\/noscript>/;
        if (!slot.test(html)) throw new Error('prerender-form: <main id="tool"> with its <noscript> note not found');
        // A function, so "$" in the markup is never read as a replacement pattern.
        return html.replace(slot, (start) => `${start}${markup}`);
      } finally {
        await server.close();
      }
    },
  };
}

export default defineConfig({
  plugins: [cspMeta(), prerenderForm()],
  oxc: {
    jsx: JSX,
  },
  build: {
    target: 'es2022',
    // The polyfill would fetch() modules, which connect-src 'none' forbids; every target browser supports modulepreload.
    modulePreload: { polyfill: false },
    // Never turn an asset into a data: URL: the CSP allows fonts and images from this site only.
    // (The PDF fonts use ?inline on purpose: they become bytes in the script, not a URL, so no fetch is needed.)
    assetsInlineLimit: 0,
    // The PDF chunk (LibPDF and its fonts) is about 1,070 kB; warn if it grows.
    chunkSizeWarningLimit: 1150,
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
