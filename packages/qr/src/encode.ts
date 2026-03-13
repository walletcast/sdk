import type { ECLevel } from './types.js';
import { VERSION_EC_TABLE, charCountBits } from './constants.js';

/** Select the smallest QR version that can hold `dataLen` bytes at the given EC level. */
export function selectVersion(dataLen: number, ecLevel: ECLevel, minVer: number, maxVer: number): number {
  for (let v = minVer; v <= maxVer; v++) {
    const entry = VERSION_EC_TABLE[v][ecLevel];
    if (!entry) continue;
    const totalDataCW = entry[0];
    // Overhead: 4 bits (mode) + charCountBits + possibly terminator/padding.
    // Data capacity = totalDataCW bytes - overhead in bytes.
    const ccBits = charCountBits(v);
    const overheadBits = 4 + ccBits;
    const availableDataBits = totalDataCW * 8 - overheadBits;
    if (dataLen * 8 <= availableDataBits) return v;
  }
  throw new Error(`Data too long for QR (${dataLen} bytes, EC level ${ecLevel})`);
}

/**
 * Encode data bytes into QR data codewords (byte mode).
 * Returns the full data codeword array padded to the version's capacity.
 */
export function encodeData(data: Uint8Array, version: number, ecLevel: ECLevel): Uint8Array {
  const entry = VERSION_EC_TABLE[version][ecLevel];
  const totalDataCW = entry[0];
  const ccBits = charCountBits(version);

  // Build bitstream.
  const bits: number[] = [];

  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  // Mode indicator: byte mode = 0100.
  pushBits(0b0100, 4);
  // Character count.
  pushBits(data.length, ccBits);
  // Data bytes.
  for (const byte of data) pushBits(byte, 8);

  // Terminator (up to 4 zero bits, but don't exceed capacity).
  const capacity = totalDataCW * 8;
  const termLen = Math.min(4, capacity - bits.length);
  pushBits(0, termLen);

  // Pad to byte boundary.
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to bytes.
  const result = new Uint8Array(totalDataCW);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    result[i / 8] = byte;
  }

  // Fill remaining with alternating pad bytes 0xEC, 0x11.
  let padIdx = bits.length / 8;
  let toggle = false;
  while (padIdx < totalDataCW) {
    result[padIdx++] = toggle ? 0x11 : 0xec;
    toggle = !toggle;
  }

  return result;
}
