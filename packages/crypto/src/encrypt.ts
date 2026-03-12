/**
 * Encryption and decryption using ECDH + HKDF-SHA256 + AES-256-GCM.
 *
 * Flow:
 * 1. Compute ECDH shared secret (secp256k1)
 * 2. Derive 32-byte encryption key via HKDF-SHA256
 * 3. Generate random 12-byte nonce
 * 4. Encrypt with AES-256-GCM using Web Crypto API
 * 5. Return base64-encoded (nonce || ciphertext+tag)
 */
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { EncryptedPayload } from '@walletcast/types';
import { computeSharedSecret } from './ecdh.js';
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
  randomBytes,
} from './utils.js';

const HKDF_INFO = new TextEncoder().encode('walletcast-v1-aes-gcm');
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive a 32-byte AES key from an ECDH shared secret using HKDF-SHA256.
 */
function deriveKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);
}

/**
 * Convert a Uint8Array to an ArrayBuffer suitable for Web Crypto API.
 * Needed because TS 5.9+ distinguishes Uint8Array<ArrayBufferLike> from BufferSource.
 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  // Use slice to create a proper ArrayBuffer copy, then cast.
  // This is safe because Uint8Array always wraps ArrayBuffer (never SharedArrayBuffer)
  // when created via new Uint8Array(n) or crypto APIs.
  return (bytes.buffer as ArrayBuffer).slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

/**
 * Import a raw AES-GCM key for Web Crypto usage.
 */
async function importAesKey(
  rawKey: Uint8Array,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBuffer(rawKey),
    { name: 'AES-GCM' },
    false,
    [usage],
  );
}

/**
 * Encrypt a plaintext string for a peer using ECDH + HKDF + AES-GCM.
 *
 * @param myPrivateKey Our 32-byte secp256k1 private key
 * @param theirPublicKey Their 33-byte compressed secp256k1 public key
 * @param plaintext The string to encrypt
 * @returns Base64-encoded encrypted payload (nonce || ciphertext || tag)
 */
export async function encryptForPeer(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
  plaintext: string,
): Promise<string> {
  const sharedSecret = computeSharedSecret(myPrivateKey, theirPublicKey);
  const aesKeyBytes = deriveKey(sharedSecret);
  const aesKey = await importAesKey(aesKeyBytes, 'encrypt');
  const nonce = randomBytes(NONCE_LENGTH);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ciphertextWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toBuffer(nonce), tagLength: TAG_LENGTH * 8 },
      aesKey,
      toBuffer(plaintextBytes),
    ),
  );

  // AES-GCM output: ciphertext || 16-byte tag
  const combined = concatBytes(nonce, ciphertextWithTag);
  return bytesToBase64(combined);
}

/**
 * Decrypt a base64-encoded payload from a peer using ECDH + HKDF + AES-GCM.
 *
 * @param myPrivateKey Our 32-byte secp256k1 private key
 * @param theirPublicKey Their 33-byte compressed secp256k1 public key
 * @param ciphertext Base64-encoded encrypted payload
 * @returns Decrypted plaintext string
 */
export async function decryptFromPeer(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
  ciphertext: string,
): Promise<string> {
  const combined = base64ToBytes(ciphertext);
  const nonce = combined.slice(0, NONCE_LENGTH);
  const ciphertextWithTag = combined.slice(NONCE_LENGTH);

  const sharedSecret = computeSharedSecret(myPrivateKey, theirPublicKey);
  const aesKeyBytes = deriveKey(sharedSecret);
  const aesKey = await importAesKey(aesKeyBytes, 'decrypt');

  const plaintextBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBuffer(nonce), tagLength: TAG_LENGTH * 8 },
      aesKey,
      toBuffer(ciphertextWithTag),
    ),
  );

  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Encrypt plaintext into a structured EncryptedPayload.
 *
 * @param myPrivateKey Our 32-byte secp256k1 private key
 * @param theirPublicKey Their 33-byte compressed secp256k1 public key
 * @param plaintext The string to encrypt
 * @returns EncryptedPayload with ciphertext, nonce, and mac fields
 */
export async function encryptPayload(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
  plaintext: string,
): Promise<EncryptedPayload> {
  const sharedSecret = computeSharedSecret(myPrivateKey, theirPublicKey);
  const aesKeyBytes = deriveKey(sharedSecret);
  const aesKey = await importAesKey(aesKeyBytes, 'encrypt');
  const nonce = randomBytes(NONCE_LENGTH);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ciphertextWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toBuffer(nonce), tagLength: TAG_LENGTH * 8 },
      aesKey,
      toBuffer(plaintextBytes),
    ),
  );

  // Split into ciphertext and tag
  const ct = ciphertextWithTag.slice(
    0,
    ciphertextWithTag.length - TAG_LENGTH,
  );
  const mac = ciphertextWithTag.slice(ciphertextWithTag.length - TAG_LENGTH);

  return { ciphertext: ct, nonce, mac };
}

/**
 * Decrypt a structured EncryptedPayload.
 *
 * @param myPrivateKey Our 32-byte secp256k1 private key
 * @param theirPublicKey Their 33-byte compressed secp256k1 public key
 * @param payload The EncryptedPayload to decrypt
 * @returns Decrypted plaintext string
 */
export async function decryptPayload(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
  payload: EncryptedPayload,
): Promise<string> {
  const sharedSecret = computeSharedSecret(myPrivateKey, theirPublicKey);
  const aesKeyBytes = deriveKey(sharedSecret);
  const aesKey = await importAesKey(aesKeyBytes, 'decrypt');

  // Recombine ciphertext + tag for AES-GCM
  const ciphertextWithTag = concatBytes(payload.ciphertext, payload.mac);

  const plaintextBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toBuffer(payload.nonce),
        tagLength: TAG_LENGTH * 8,
      },
      aesKey,
      toBuffer(ciphertextWithTag),
    ),
  );

  return new TextDecoder().decode(plaintextBytes);
}
