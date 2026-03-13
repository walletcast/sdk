import type { ECLevel } from './types.js';
import { ALIGNMENT_POSITIONS, EC_LEVEL_INDEX, FORMAT_INFO, VERSION_INFO } from './constants.js';

/** Create a size×size grid initialized to `val`. */
function grid<T>(size: number, val: T): T[][] {
  return Array.from({ length: size }, () => Array(size).fill(val));
}

/** Place a finder pattern (7×7) with top-left at (row, col). */
function placeFinder(modules: boolean[][], reserved: boolean[][], row: number, col: number): void {
  for (let dr = 0; dr < 7; dr++) {
    for (let dc = 0; dc < 7; dc++) {
      const dark =
        dr === 0 || dr === 6 || dc === 0 || dc === 6 || // outer ring
        (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);     // inner 3×3
      modules[row + dr][col + dc] = dark;
      reserved[row + dr][col + dc] = true;
    }
  }
}

/** Place finder patterns and their separators. */
function placeFinders(modules: boolean[][], reserved: boolean[][], size: number): void {
  placeFinder(modules, reserved, 0, 0);                   // top-left
  placeFinder(modules, reserved, 0, size - 7);             // top-right
  placeFinder(modules, reserved, size - 7, 0);             // bottom-left

  // Separators: 1-module border of light around each finder.
  for (let i = 0; i < 8; i++) {
    // Top-left: right column and bottom row of separator.
    for (const [r, c] of [[i, 7], [7, i]]) {
      if (r < size && c < size) { modules[r][c] = false; reserved[r][c] = true; }
    }
    // Top-right.
    for (const [r, c] of [[i, size - 8], [7, size - 8 + i]]) {
      if (r < size && c >= 0 && c < size) { modules[r][c] = false; reserved[r][c] = true; }
    }
    // Bottom-left.
    for (const [r, c] of [[size - 8, i], [size - 8 + i, 7]]) {
      if (r >= 0 && r < size && c < size) { modules[r][c] = false; reserved[r][c] = true; }
    }
  }
}

/** Place timing patterns (alternating dark/light on row 6 and col 6). */
function placeTiming(modules: boolean[][], reserved: boolean[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    // Horizontal timing (row 6).
    if (!reserved[6][i]) { modules[6][i] = dark; reserved[6][i] = true; }
    // Vertical timing (col 6).
    if (!reserved[i][6]) { modules[i][6] = dark; reserved[i][6] = true; }
  }
}

/** Place alignment patterns for versions ≥ 2. */
function placeAlignment(modules: boolean[][], reserved: boolean[][], version: number): void {
  const positions = ALIGNMENT_POSITIONS[version];
  if (!positions) return;

  for (const cy of positions) {
    for (const cx of positions) {
      // Skip if overlapping a finder pattern.
      if (cy <= 8 && cx <= 8) continue;                              // top-left finder
      if (cy <= 8 && cx >= modules.length - 9) continue;             // top-right
      if (cy >= modules.length - 9 && cx <= 8) continue;             // bottom-left

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          modules[cy + dr][cx + dc] = dark;
          reserved[cy + dr][cx + dc] = true;
        }
      }
    }
  }
}

/** Reserve format information areas (actual bits placed later after masking). */
function reserveFormat(reserved: boolean[][], size: number): void {
  // Around top-left finder.
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  // Around top-right finder.
  for (let i = 0; i < 8; i++) reserved[8][size - 1 - i] = true;
  // Around bottom-left finder.
  for (let i = 0; i < 7; i++) reserved[size - 1 - i][8] = true;
  // Dark module.
  reserved[size - 8][8] = true;
}

/** Reserve version information areas (versions ≥ 7). */
function reserveVersion(reserved: boolean[][], version: number, size: number): void {
  if (version < 7) return;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      reserved[i][size - 11 + j] = true;  // top-right
      reserved[size - 11 + j][i] = true;  // bottom-left
    }
  }
}

/**
 * Place data and EC codewords into the matrix using the zigzag pattern.
 */
function placeData(modules: boolean[][], reserved: boolean[][], data: Uint8Array): void {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = data.length * 8;

  // Right-to-left column pairs, skipping column 6 (timing).
  let col = size - 1;
  while (col >= 0) {
    if (col === 6) col--; // Skip timing column.

    // Scan upward or downward.
    for (let pass = 0; pass < size; pass++) {
      const row = ((Math.floor((size - 1 - col) / 2)) % 2 === 0) ? size - 1 - pass : pass;

      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= size) continue;
        if (reserved[row][c]) continue;
        if (bitIdx < totalBits) {
          const byteIdx = bitIdx >>> 3;
          const bitOffset = 7 - (bitIdx & 7);
          modules[row][c] = ((data[byteIdx] >>> bitOffset) & 1) === 1;
          bitIdx++;
        }
      }
    }

    col -= 2;
  }
}

/** Write the 15-bit format information after masking. */
export function placeFormatBits(modules: boolean[][], ecLevel: ECLevel, maskIdx: number): void {
  const size = modules.length;
  const info = FORMAT_INFO[EC_LEVEL_INDEX[ecLevel] * 8 + maskIdx];

  for (let i = 0; i < 15; i++) {
    const bit = ((info >>> (14 - i)) & 1) === 1;

    // Around top-left finder.
    if (i < 6) modules[8][i] = bit;
    else if (i === 6) modules[8][7] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[7][8] = bit;
    else modules[14 - i][8] = bit;

    // Second copy.
    if (i < 8) modules[size - 1 - i][8] = bit;
    else modules[8][size - 15 + i] = bit;
  }

  // Dark module (always dark).
  modules[size - 8][8] = true;
}

/** Write version information for versions ≥ 7. */
function placeVersionBits(modules: boolean[][], version: number): void {
  if (version < 7) return;
  const size = modules.length;
  const info = VERSION_INFO[version];

  for (let i = 0; i < 18; i++) {
    const bit = ((info >>> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = i % 3;
    modules[row][size - 11 + col] = bit;     // top-right
    modules[size - 11 + col][row] = bit;     // bottom-left
  }
}

/**
 * Build the QR matrix with all function patterns and data placed.
 * Returns modules and a reserved mask (for use by the masking step).
 */
export function buildMatrix(
  version: number,
  data: Uint8Array,
): { modules: boolean[][]; reserved: boolean[][] } {
  const size = 4 * version + 17;
  const modules = grid(size, false);
  const reserved = grid(size, false);

  // Function patterns.
  placeFinders(modules, reserved, size);
  placeTiming(modules, reserved, size);
  placeAlignment(modules, reserved, version);
  reserveFormat(reserved, size);
  reserveVersion(reserved, version, size);

  // Version info (before data, so reserved grid is correct).
  placeVersionBits(modules, version);

  // Data codewords.
  placeData(modules, reserved, data);

  return { modules, reserved };
}
