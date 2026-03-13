import { finalizeEvent } from 'nostr-tools/pure';
import type { Event as NostrEvent } from 'nostr-tools/core';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import type { SignalingMessage } from '@walletcast/types';

/** Custom ephemeral event kind for WalletCast signaling. */
export const SIGNALING_EVENT_KIND = 21059;

/**
 * Convert a hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute an ECDH shared secret between a private key and a public key,
 * then derive an AES-256-GCM key using HKDF-SHA256.
 */
async function deriveSharedKey(
  myPrivKey: Uint8Array,
  theirPubKeyHex: string,
): Promise<CryptoKey> {
  // Compute raw ECDH shared point (compressed)
  const theirPubBytes = hexToBytes(theirPubKeyHex);
  const sharedPoint = secp256k1.getSharedSecret(myPrivKey, theirPubBytes);
  // Use the x-coordinate (bytes 1..33 of the uncompressed point) as input keying material
  const sharedX = sharedPoint.slice(1, 33);

  // HKDF-SHA256: extract + expand to get 32 bytes for AES-256-GCM
  const info = new TextEncoder().encode('walletcast-signaling-v1');
  const derivedKeyMaterial = hkdf(sha256, sharedX, undefined, info, 32);

  // Import as AES-GCM CryptoKey
  // Copy into a standard ArrayBuffer to satisfy TypeScript 5.9's strict BufferSource checks
  const keyBuffer = new Uint8Array(derivedKeyMaterial).buffer as ArrayBuffer;
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext using AES-256-GCM. Returns base64(nonce || ciphertext+tag).
 */
async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoded,
  );
  // Concatenate nonce + ciphertext (which includes the 16-byte auth tag)
  const combined = new Uint8Array(12 + ciphertextBuf.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ciphertextBuf), 12);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt base64(nonce || ciphertext+tag) using AES-256-GCM.
 */
async function decrypt(
  key: CryptoKey,
  encoded: string,
): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const nonce = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintextBuf);
}

/**
 * Get the compressed public key hex (without the 02/03 prefix — Nostr uses
 * x-only 32-byte public keys) from a 32-byte private key.
 */
function getNostrPubKeyHex(privKey: Uint8Array): string {
  const fullPub = secp256k1.getPublicKey(privKey, true); // 33 bytes compressed
  // Nostr uses x-only (schnorr) pubkeys — drop the first byte
  return bytesToHex(fullPub.slice(1));
}

/**
 * Create a signed, encrypted Nostr event carrying a SignalingMessage.
 *
 * The event content is encrypted with AES-256-GCM using an ECDH-derived
 * shared secret between sender and recipient, following NIP-44-style patterns.
 *
 * @param message       The signaling message to send (SDP or ICE)
 * @param senderPrivKey 32-byte secp256k1 private key of the sender
 * @param recipientPubKey Hex-encoded public key of the recipient (32-byte x-only OR 33-byte compressed)
 * @returns A signed Nostr event ready for publishing
 */
export async function createSignalingEvent(
  message: SignalingMessage,
  senderPrivKey: Uint8Array,
  recipientPubKey: string,
): Promise<NostrEvent> {
  // Ensure the recipient key is in compressed format (33 bytes / 66 hex chars)
  // for ECDH. Nostr keys are x-only (32 bytes), so prefix with 02 if needed.
  const compressedRecipientPub =
    recipientPubKey.length === 64
      ? '02' + recipientPubKey
      : recipientPubKey;

  const sharedKey = await deriveSharedKey(senderPrivKey, compressedRecipientPub);
  const plaintext = JSON.stringify(message);
  const encryptedContent = await encrypt(sharedKey, plaintext);

  // The recipient tag uses x-only (32-byte) pubkey
  const recipientXOnly =
    recipientPubKey.length === 66
      ? recipientPubKey.slice(2)
      : recipientPubKey;

  const eventTemplate = {
    kind: SIGNALING_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientXOnly]],
    content: encryptedContent,
  };

  // finalizeEvent adds id, pubkey, sig
  return finalizeEvent(eventTemplate, senderPrivKey);
}

/**
 * Parse and decrypt a received Nostr signaling event.
 *
 * @param event     The received Nostr event
 * @param myPrivKey 32-byte private key of the recipient
 * @returns The decrypted SignalingMessage, or null if decryption/parsing fails
 */
export async function parseSignalingEvent(
  event: NostrEvent,
  myPrivKey: Uint8Array,
): Promise<SignalingMessage | null> {
  try {
    if (event.kind !== SIGNALING_EVENT_KIND) {
      return null;
    }

    // event.pubkey is the sender's x-only pubkey (32 bytes hex)
    const senderCompressedPub = '02' + event.pubkey;
    const sharedKey = await deriveSharedKey(myPrivKey, senderCompressedPub);
    const plaintext = await decrypt(sharedKey, event.content);
    const parsed = JSON.parse(plaintext) as SignalingMessage;

    // Basic validation
    if (parsed.kind !== 'sdp' && parsed.kind !== 'ice') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export { getNostrPubKeyHex, hexToBytes, bytesToHex, deriveSharedKey, encrypt, decrypt };
