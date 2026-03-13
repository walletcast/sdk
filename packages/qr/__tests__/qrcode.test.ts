import { describe, it, expect } from 'vitest';
import { encodeQR } from '../src/qrcode.js';

describe('encodeQR', () => {
  it('encodes a short string', () => {
    const qr = encodeQR('HELLO');
    expect(qr.version).toBeGreaterThanOrEqual(1);
    expect(qr.size).toBe(4 * qr.version + 17);
    expect(qr.modules.length).toBe(qr.size);
    expect(qr.modules[0].length).toBe(qr.size);
  });

  it('encodes a walletcast URI', () => {
    const uri = 'walletcast:v1:02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?r=wss%3A%2F%2Frelay.damus.io&r=wss%3A%2F%2Fnos.lol';
    const qr = encodeQR(uri);
    // URI is ~130 chars, should be version 5-7 at EC M.
    expect(qr.version).toBeGreaterThanOrEqual(5);
    expect(qr.version).toBeLessThanOrEqual(10);
  });

  it('encodes a long URI with bootnodes', () => {
    const uri = 'walletcast:v1:02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90?r=wss%3A%2F%2Frelay.damus.io&r=wss%3A%2F%2Fnos.lol&b=%2Fip4%2F192.168.1.1%2Ftcp%2F4001%2Fp2p%2FQmPeer1&b=%2Fdns4%2Fboot.example.com%2Ftcp%2F443%2Fwss%2Fp2p%2FQmPeer2';
    const qr = encodeQR(uri);
    expect(qr.version).toBeGreaterThanOrEqual(8);
  });

  it('respects minVersion', () => {
    const qr = encodeQR('A', { minVersion: 5 });
    expect(qr.version).toBe(5);
  });

  it('works with all EC levels', () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      const qr = encodeQR('test data', { ecLevel });
      expect(qr.modules.length).toBe(qr.size);
    }
  });

  it('accepts Uint8Array input', () => {
    const bytes = new Uint8Array([72, 69, 76, 76, 79]);
    const qr = encodeQR(bytes);
    expect(qr.size).toBeGreaterThanOrEqual(21);
  });

  it('has finder patterns in all three corners', () => {
    const qr = encodeQR('test');
    // Top-left 7x7 finder: top-left corner should be dark.
    expect(qr.modules[0][0]).toBe(true);
    // Top-right 7x7 finder.
    expect(qr.modules[0][qr.size - 1]).toBe(true);
    // Bottom-left 7x7 finder.
    expect(qr.modules[qr.size - 1][0]).toBe(true);
    // Bottom-right corner should NOT have a finder.
    // (It's not always dark, but the key point is the three corners have finders.)
  });

  it('produces deterministic output', () => {
    const qr1 = encodeQR('deterministic');
    const qr2 = encodeQR('deterministic');
    expect(qr1.version).toBe(qr2.version);
    for (let r = 0; r < qr1.size; r++) {
      expect(qr1.modules[r]).toEqual(qr2.modules[r]);
    }
  });

  it('different data produces different QR codes', () => {
    const qr1 = encodeQR('hello');
    const qr2 = encodeQR('world');
    let differs = false;
    for (let r = 0; r < qr1.size && !differs; r++) {
      for (let c = 0; c < qr1.size && !differs; c++) {
        if (qr1.modules[r][c] !== qr2.modules[r][c]) differs = true;
      }
    }
    expect(differs).toBe(true);
  });
});
