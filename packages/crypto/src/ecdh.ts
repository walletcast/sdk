/**
 * ECDH shared secret computation using secp256k1.
 */
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * Compute a shared secret using ECDH with secp256k1.
 *
 * @param privateKey Our 32-byte private key
 * @param publicKey Their 33-byte compressed public key
 * @returns 32-byte shared secret (x-coordinate of the ECDH point)
 */
export function computeSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey, true);
  // The shared secret is the x-coordinate (drop the 0x02/0x03 prefix byte)
  return sharedPoint.slice(1);
}
