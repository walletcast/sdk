import { describe, it, expect } from 'vitest';
import { selectVersion, encodeData } from '../src/encode.js';

describe('selectVersion', () => {
  it('selects version 1 for very short data at EC level M', () => {
    // Version 1-M holds 16 data codewords.
    expect(selectVersion(10, 'M', 1, 40)).toBe(1);
  });

  it('selects higher version for longer data', () => {
    // 120 bytes should need version 5+ at EC level M.
    const ver = selectVersion(120, 'M', 1, 40);
    expect(ver).toBeGreaterThanOrEqual(5);
  });

  it('respects minVersion', () => {
    expect(selectVersion(1, 'L', 5, 40)).toBe(5);
  });

  it('throws when data is too long', () => {
    expect(() => selectVersion(3000, 'H', 1, 40)).toThrow('Data too long');
  });

  it('uses 8-bit char count for versions 1-9', () => {
    // Versions 1-9 have 8-bit character count field.
    // Version 2-L holds 34 data codewords → 34 - 1.5 overhead ≈ 32 bytes.
    const v = selectVersion(25, 'L', 1, 40);
    expect(v).toBeLessThanOrEqual(9);
  });
});

describe('encodeData', () => {
  it('produces correct total codeword count', () => {
    const data = new TextEncoder().encode('HELLO');
    // Version 1-M: 16 data codewords.
    const cw = encodeData(data, 1, 'M');
    expect(cw.length).toBe(16);
  });

  it('starts with byte mode indicator (0100 = 0x4x)', () => {
    const data = new TextEncoder().encode('A');
    const cw = encodeData(data, 1, 'M');
    // First 4 bits should be 0100 → first byte starts with 0x4.
    expect((cw[0] >> 4) & 0xf).toBe(4);
  });

  it('pads with 0xEC and 0x11', () => {
    const data = new TextEncoder().encode('A'); // 1 byte → mode(4)+count(8)+data(8)=20 bits → 3 bytes, then padding.
    const cw = encodeData(data, 1, 'M');
    // After data bytes, remaining should alternate 0xEC, 0x11.
    // Byte index 3+ should be padding.
    expect(cw[3]).toBe(0xec);
    expect(cw[4]).toBe(0x11);
  });
});
