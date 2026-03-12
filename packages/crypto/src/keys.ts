/**
 * Key generation utilities for secp256k1 keypairs.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import type { KeyPair } from '@walletcast/types';
import { bytesToHex, randomBytes } from './utils.js';

/**
 * Generate a new secp256k1 keypair.
 * @returns A KeyPair with 32-byte private key and 33-byte compressed public key.
 */
export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  return {
    privateKey,
    publicKey,
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Derive the compressed public key from a private key.
 * @param privateKey 32-byte secp256k1 private key
 * @returns 33-byte compressed public key
 */
export function pubKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true);
}
