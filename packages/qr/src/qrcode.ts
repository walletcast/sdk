import type { QRCode, QROptions, ECLevel } from './types.js';
import { VERSION_EC_TABLE } from './constants.js';
import { selectVersion, encodeData } from './encode.js';
import { computeEC } from './reed-solomon.js';
import { buildMatrix } from './matrix.js';
import { applyBestMask } from './mask.js';

/**
 * Encode data into a QR code.
 *
 * @param data - String (encoded as UTF-8) or raw bytes.
 * @param options - EC level and version constraints.
 * @returns A QRCode with the boolean module matrix.
 */
export function encodeQR(data: string | Uint8Array, options?: QROptions): QRCode {
  const ecLevel: ECLevel = options?.ecLevel ?? 'M';
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  // 1. Select version.
  const version = selectVersion(
    bytes.length,
    ecLevel,
    options?.minVersion ?? 1,
    options?.maxVersion ?? 40,
  );

  // 2. Encode data to codewords.
  const dataCW = encodeData(bytes, version, ecLevel);

  // 3. Split into blocks and compute EC for each.
  const entry = VERSION_EC_TABLE[version][ecLevel];
  const [, ecCWPerBlock, g1Count, g1DataCW, g2Count, g2DataCW] = entry;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < g1Count; i++) {
    const block = dataCW.slice(offset, offset + g1DataCW);
    dataBlocks.push(block);
    ecBlocks.push(computeEC(block, ecCWPerBlock));
    offset += g1DataCW;
  }
  for (let i = 0; i < g2Count; i++) {
    const block = dataCW.slice(offset, offset + g2DataCW);
    dataBlocks.push(block);
    ecBlocks.push(computeEC(block, ecCWPerBlock));
    offset += g2DataCW;
  }

  // 4. Interleave data blocks, then EC blocks.
  const interleaved: number[] = [];

  // Data interleaving: take byte i from each block in order.
  const maxDataLen = Math.max(g1DataCW, g2DataCW);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }

  // EC interleaving.
  for (let i = 0; i < ecCWPerBlock; i++) {
    for (const block of ecBlocks) {
      interleaved.push(block[i]);
    }
  }

  // 5. Build matrix.
  const interleavedBytes = new Uint8Array(interleaved);
  const { modules, reserved } = buildMatrix(version, interleavedBytes);

  // 6. Apply best mask.
  applyBestMask(modules, reserved, ecLevel);

  return {
    version,
    size: 4 * version + 17,
    modules,
  };
}
