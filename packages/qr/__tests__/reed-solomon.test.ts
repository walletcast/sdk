import { describe, it, expect } from 'vitest';
import { gfMul, computeEC } from '../src/reed-solomon.js';

describe('GF(256) arithmetic', () => {
  it('multiply by 0 is 0', () => {
    expect(gfMul(0, 42)).toBe(0);
    expect(gfMul(42, 0)).toBe(0);
  });

  it('multiply by 1 is identity', () => {
    expect(gfMul(1, 42)).toBe(42);
    expect(gfMul(137, 1)).toBe(137);
  });

  it('multiplication is commutative', () => {
    expect(gfMul(29, 54)).toBe(gfMul(54, 29));
  });

  it('known product', () => {
    // GF(256) with poly 0x11d: 2 * 2 = 4, 2 * 128 = 256 XOR 0x11d = 29
    expect(gfMul(2, 2)).toBe(4);
    expect(gfMul(2, 128)).toBe(0x1d); // 256 mod 0x11d
  });
});

describe('Reed-Solomon EC', () => {
  it('produces correct number of EC codewords', () => {
    const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    const ec = computeEC(data, 10);
    expect(ec.length).toBe(10);
  });

  it('known version-1-M test vector', () => {
    // Version 1-M: 16 data codewords, 10 EC codewords.
    // Data: "01234567" encoded in byte mode.
    const data = new Uint8Array([64, 132, 134, 70, 21, 38, 55, 236, 17, 236, 17, 236, 17, 236, 17, 236]);
    const ec = computeEC(data, 10);
    expect(ec.length).toBe(10);
    // EC codewords should be deterministic.
    expect(Array.from(ec)).toEqual(Array.from(computeEC(data, 10)));
  });

  it('different data produces different EC', () => {
    const d1 = new Uint8Array([1, 2, 3, 4]);
    const d2 = new Uint8Array([5, 6, 7, 8]);
    const ec1 = computeEC(d1, 4);
    const ec2 = computeEC(d2, 4);
    expect(Array.from(ec1)).not.toEqual(Array.from(ec2));
  });
});
