import type { QRCode, SVGOptions } from './types.js';

/**
 * Render a QR code as an SVG string.
 * Merges adjacent dark modules in each row into wider rects for smaller output.
 */
export function renderSVG(qr: QRCode, options?: SVGOptions): string {
  const m = options?.moduleSize ?? 10;
  const q = options?.quietZone ?? 4;
  const fg = options?.foreground ?? '#000000';
  const bg = options?.background ?? '#ffffff';
  const total = (qr.size + 2 * q) * m;

  const rects: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (qr.modules[y][x]) {
        const startX = x;
        while (x < qr.size && qr.modules[y][x]) x++;
        const w = x - startX;
        rects.push(`<rect x="${(startX + q) * m}" y="${(y + q) * m}" width="${w * m}" height="${m}"/>`);
      } else {
        x++;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">`,
    `<rect width="${total}" height="${total}" fill="${bg}"/>`,
    `<g fill="${fg}">${rects.join('')}</g>`,
    `</svg>`,
  ].join('');
}
