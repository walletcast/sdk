import { describe, it, expect } from 'vitest';
import { encodeQR } from '../src/qrcode.js';
import { renderSVG } from '../src/svg.js';
import { toSVGDataURL } from '../src/index.js';

describe('renderSVG', () => {
  const qr = encodeQR('test');

  it('produces valid SVG', () => {
    const svg = renderSVG(qr);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('</svg>');
  });

  it('uses default colors', () => {
    const svg = renderSVG(qr);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it('applies custom colors', () => {
    const svg = renderSVG(qr, { foreground: '#818cf8', background: '#1a1a1a' });
    expect(svg).toContain('fill="#1a1a1a"');
    expect(svg).toContain('fill="#818cf8"');
  });

  it('applies custom module size', () => {
    const svg = renderSVG(qr, { moduleSize: 5, quietZone: 2 });
    const total = (qr.size + 4) * 5;
    expect(svg).toContain(`width="${total}"`);
    expect(svg).toContain(`height="${total}"`);
  });

  it('contains rect elements for dark modules', () => {
    const svg = renderSVG(qr);
    // Should have at least some rects (dark modules).
    const rectCount = (svg.match(/<rect /g) || []).length;
    // At least background rect + some data rects.
    expect(rectCount).toBeGreaterThan(1);
  });
});

describe('toSVGDataURL', () => {
  it('returns a data: URL', () => {
    const url = toSVGDataURL('test');
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('contains encoded SVG content', () => {
    const url = toSVGDataURL('hello');
    const decoded = decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('</svg>');
  });
});
