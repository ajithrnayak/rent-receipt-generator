/**
 * The minimum a PDF library has to offer for our receipts. The layout code
 * only talks to this, so each library is a thin adapter and the comparison is fair.
 * Coordinates are in points from the TOP-LEFT of the page; y for text is the baseline.
 */
export type FontKey = 'regular' | 'semibold' | 'bold';
export type RGB = readonly [number, number, number];

export interface StrokeOpts {
  thickness: number;
  color: RGB;
  dash?: number[];
}

export interface Canvas {
  readonly pageWidth: number;
  readonly pageHeight: number;
  addPage(): void;
  width(text: string, font: FontKey, size: number): number;
  text(text: string, x: number, baseline: number, font: FontKey, size: number, color: RGB): void;
  line(x1: number, y1: number, x2: number, y2: number, opts: StrokeOpts): void;
  /** Stroked rectangle; (x, y) is the top-left corner. */
  rect(x: number, y: number, w: number, h: number, opts: StrokeOpts): void;
  save(): Promise<Uint8Array>;
}

export type FontBytes = Record<FontKey, Uint8Array>;
export type CanvasFactory = (fonts: FontBytes) => Promise<Canvas>;

/** A4 in points. */
export const A4 = { width: 595.28, height: 841.89 } as const;

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
