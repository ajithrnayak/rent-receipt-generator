import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSP } from '../vite.config.ts';

describe('Content-Security-Policy', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const header = headers.match(/Content-Security-Policy: (.+)/)?.[1]?.trim() ?? '';

  it('production header and the build meta tag say the same thing', () => {
    // frame-ancestors only works as a header, so it is the one extra directive.
    expect(header).toBe(`${CSP}; frame-ancestors 'none'`);
  });

  it('forbids fetch and other connections, inline code, and data: URLs', () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).not.toContain('data:');
    expect(CSP).not.toContain('unsafe-inline');
    expect(CSP).not.toContain('unsafe-eval');
    expect(CSP).not.toMatch(/https?:/);
  });
});
