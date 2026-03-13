import { describe, it, expect } from 'vitest';
import { buildMatrix } from '../src/matrix.js';

describe('buildMatrix', () => {
  it('produces correct size for version 1', () => {
    const data = new Uint8Array(26); // Total codewords for v1 = 26.
    const { modules } = buildMatrix(1, data);
    expect(modules.length).toBe(21);
    expect(modules[0].length).toBe(21);
  });

  it('produces correct size for version 5', () => {
    const data = new Uint8Array(134); // Total codewords for v5.
    const { modules } = buildMatrix(5, data);
    expect(modules.length).toBe(37);
  });

  it('has finder pattern at top-left (dark center)', () => {
    const data = new Uint8Array(26);
    const { modules } = buildMatrix(1, data);
    // 7x7 finder pattern: corners and center should be dark.
    expect(modules[0][0]).toBe(true);
    expect(modules[0][6]).toBe(true);
    expect(modules[6][0]).toBe(true);
    expect(modules[6][6]).toBe(true);
    expect(modules[3][3]).toBe(true); // center
  });

  it('has finder pattern at top-right', () => {
    const data = new Uint8Array(26);
    const { modules } = buildMatrix(1, data);
    expect(modules[0][14]).toBe(true); // top-right finder starts at col size-7=14
    expect(modules[0][20]).toBe(true);
    expect(modules[3][17]).toBe(true); // center
  });

  it('has finder pattern at bottom-left', () => {
    const data = new Uint8Array(26);
    const { modules } = buildMatrix(1, data);
    expect(modules[14][0]).toBe(true); // bottom-left finder starts at row size-7=14
    expect(modules[17][3]).toBe(true); // center
  });

  it('has timing pattern on row 6', () => {
    const data = new Uint8Array(26);
    const { modules } = buildMatrix(1, data);
    // Timing alternates starting dark at col 8.
    expect(modules[6][8]).toBe(true);  // dark (even)
    expect(modules[6][9]).toBe(false); // light (odd)
    expect(modules[6][10]).toBe(true); // dark
  });

  it('has timing pattern on col 6', () => {
    const data = new Uint8Array(26);
    const { modules } = buildMatrix(1, data);
    expect(modules[8][6]).toBe(true);
    expect(modules[9][6]).toBe(false);
    expect(modules[10][6]).toBe(true);
  });
});
