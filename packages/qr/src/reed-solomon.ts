/**
 * Reed-Solomon error correction over GF(256) with primitive polynomial 0x11d.
 */

// Precompute log and antilog (exp) tables for GF(256).
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  // Duplicate for easy modular access.
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

/** Multiply two GF(256) values. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Compute the generator polynomial for `n` error correction codewords. */
function generatorPoly(n: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(gen.length + 1);
    const factor = EXP[i]; // (x - alpha^i)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen = next;
  }
  return gen;
}

// Cache generator polys.
const genCache = new Map<number, Uint8Array>();

/**
 * Compute `numEC` Reed-Solomon error correction codewords for the given data.
 */
export function computeEC(data: Uint8Array, numEC: number): Uint8Array {
  let gen = genCache.get(numEC);
  if (!gen) {
    gen = generatorPoly(numEC);
    genCache.set(numEC, gen);
  }

  // Polynomial long division.
  const result = new Uint8Array(numEC);
  for (let i = 0; i < data.length; i++) {
    const coeff = result[0] ^ data[i];
    // Shift result left by 1.
    for (let j = 0; j < numEC - 1; j++) result[j] = result[j + 1];
    result[numEC - 1] = 0;
    // XOR with generator * coeff.
    if (coeff !== 0) {
      for (let j = 0; j < numEC; j++) {
        result[j] ^= gfMul(gen[j + 1], coeff);
      }
    }
  }
  return result;
}
