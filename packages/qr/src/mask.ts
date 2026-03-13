import type { ECLevel } from './types.js';
import { placeFormatBits } from './matrix.js';

/** The 8 QR mask pattern conditions. */
const MASK_FNS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Apply or remove a mask (XOR on non-reserved data modules). */
function applyMask(modules: boolean[][], reserved: boolean[][], maskIdx: number): void {
  const fn = MASK_FNS[maskIdx];
  const size = modules.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && fn(r, c)) {
        modules[r][c] = !modules[r][c];
      }
    }
  }
}

/** Compute penalty score for the current module state. */
function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1: Runs of 5+ same-color modules in rows and columns.
  for (let r = 0; r < size; r++) {
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) score += runLen - 2;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen - 2;
  }
  for (let c = 0; c < size; c++) {
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        runLen++;
      } else {
        if (runLen >= 5) score += runLen - 2;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen - 2;
  }

  // Rule 2: 2×2 blocks of same color.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: Finder-like patterns (1011101 0000 or 0000 1011101).
  const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      let match1 = true, match2 = true;
      for (let k = 0; k < 11; k++) {
        if (modules[r][c + k] !== pattern1[k]) match1 = false;
        if (modules[r][c + k] !== pattern2[k]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1) score += 40;
      if (match2) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      let match1 = true, match2 = true;
      for (let k = 0; k < 11; k++) {
        if (modules[r + k][c] !== pattern1[k]) match1 = false;
        if (modules[r + k][c] !== pattern2[k]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1) score += 40;
      if (match2) score += 40;
    }
  }

  // Rule 4: Proportion of dark modules.
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount++;
    }
  }
  const pct = (darkCount * 100) / (size * size);
  const prev5 = Math.floor(pct / 5) * 5;
  const next5 = prev5 + 5;
  score += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

  return score;
}

/**
 * Try all 8 masks, pick the one with the lowest penalty, apply it,
 * and write format information. Returns the chosen mask index.
 */
export function applyBestMask(
  modules: boolean[][],
  reserved: boolean[][],
  ecLevel: ECLevel,
): number {
  let bestMask = 0;
  let bestScore = Infinity;

  // Snapshot the module state before testing masks.
  const snapshot = modules.map(row => row.slice());

  for (let m = 0; m < 8; m++) {
    // Restore to pre-mask state.
    for (let r = 0; r < modules.length; r++) {
      for (let c = 0; c < modules.length; c++) modules[r][c] = snapshot[r][c];
    }
    applyMask(modules, reserved, m);
    placeFormatBits(modules, ecLevel, m);
    const s = penalty(modules);
    if (s < bestScore) {
      bestScore = s;
      bestMask = m;
    }
  }

  // Restore and apply the best mask permanently.
  for (let r = 0; r < modules.length; r++) {
    for (let c = 0; c < modules.length; c++) modules[r][c] = snapshot[r][c];
  }
  applyMask(modules, reserved, bestMask);
  placeFormatBits(modules, ecLevel, bestMask);
  return bestMask;
}
