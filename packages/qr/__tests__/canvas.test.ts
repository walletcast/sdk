import { describe, it, expect, vi } from 'vitest';
import { encodeQR } from '../src/qrcode.js';
import { renderCanvas } from '../src/canvas.js';

function mockCanvas() {
  const fillRectCalls: { x: number; y: number; w: number; h: number }[] = [];
  const fillStyles: string[] = [];
  const ctx = {
    fillRect(x: number, y: number, w: number, h: number) {
      fillRectCalls.push({ x, y, w, h });
    },
    set fillStyle(v: string) {
      fillStyles.push(v);
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx),
  };
  return { canvas, fillRectCalls, fillStyles };
}

describe('renderCanvas', () => {
  it('sets canvas dimensions', () => {
    const qr = encodeQR('test');
    const { canvas } = mockCanvas();
    renderCanvas(qr, canvas as unknown as HTMLCanvasElement);
    const expected = (qr.size + 8) * 10; // default quietZone=4, moduleSize=10.
    expect(canvas.width).toBe(expected);
    expect(canvas.height).toBe(expected);
  });

  it('calls getContext("2d")', () => {
    const qr = encodeQR('A');
    const { canvas } = mockCanvas();
    renderCanvas(qr, canvas as unknown as HTMLCanvasElement);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
  });

  it('draws background + dark modules', () => {
    const qr = encodeQR('A');
    const { canvas, fillRectCalls } = mockCanvas();
    renderCanvas(qr, canvas as unknown as HTMLCanvasElement);

    // Count dark modules.
    let darkCount = 0;
    for (const row of qr.modules) for (const m of row) if (m) darkCount++;

    // fillRect: 1 background + darkCount module rects.
    expect(fillRectCalls.length).toBe(1 + darkCount);
  });

  it('applies custom options', () => {
    const qr = encodeQR('test');
    const { canvas } = mockCanvas();
    renderCanvas(qr, canvas as unknown as HTMLCanvasElement, {
      moduleSize: 5,
      quietZone: 2,
    });
    const expected = (qr.size + 4) * 5;
    expect(canvas.width).toBe(expected);
  });
});
