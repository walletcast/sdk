import type { QRCode, CanvasOptions } from './types.js';

/**
 * Render a QR code onto an HTMLCanvasElement.
 */
export function renderCanvas(
  qr: QRCode,
  canvas: HTMLCanvasElement,
  options?: CanvasOptions,
): void {
  const m = options?.moduleSize ?? 10;
  const q = options?.quietZone ?? 4;
  const fg = options?.foreground ?? '#000000';
  const bg = options?.background ?? '#ffffff';
  const total = (qr.size + 2 * q) * m;

  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, total, total);

  ctx.fillStyle = fg;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        ctx.fillRect((x + q) * m, (y + q) * m, m, m);
      }
    }
  }
}
