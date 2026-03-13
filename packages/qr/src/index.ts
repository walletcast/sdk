export { encodeQR } from './qrcode.js';
export type { QRCode, QROptions, SVGOptions, CanvasOptions } from './types.js';
export { renderSVG } from './svg.js';
export { renderCanvas } from './canvas.js';

import { encodeQR } from './qrcode.js';
import { renderSVG } from './svg.js';
import type { QROptions, SVGOptions } from './types.js';

/** Convenience: encode data and return a `data:image/svg+xml` URL. */
export function toSVGDataURL(
  data: string | Uint8Array,
  options?: QROptions & SVGOptions,
): string {
  const qr = encodeQR(data, options);
  const svg = renderSVG(qr, options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
