/**
 * Minimal crypto for the connector page.
 * Same algorithms as @walletcast/nostr-signaling/events.ts:
 * ECDH (secp256k1) + HKDF-SHA256 + AES-256-GCM
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { schnorr } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateKeyPair(): { privateKey: Uint8Array; publicKeyHex: string } {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const fullPub = secp256k1.getPublicKey(privateKey, true); // 33 bytes compressed
  const publicKeyHex = bytesToHex(fullPub.slice(1)); // x-only (32 bytes)
  return { privateKey, publicKeyHex };
}

export function restoreKeyPair(privateKeyHex: string): { privateKey: Uint8Array; publicKeyHex: string } {
  const privateKey = hexToBytes(privateKeyHex);
  const fullPub = secp256k1.getPublicKey(privateKey, true);
  const publicKeyHex = bytesToHex(fullPub.slice(1));
  return { privateKey, publicKeyHex };
}

export async function deriveSharedKey(
  myPrivKey: Uint8Array,
  theirPubKeyHex: string,
): Promise<CryptoKey> {
  const theirPubBytes = hexToBytes(theirPubKeyHex);
  const sharedPoint = secp256k1.getSharedSecret(myPrivKey, theirPubBytes);
  const sharedX = sharedPoint.slice(1, 33);

  const info = new TextEncoder().encode('walletcast-signaling-v1');
  const derivedKeyMaterial = hkdf(sha256, sharedX, undefined, info, 32);

  const keyBuffer = new Uint8Array(derivedKeyMaterial).buffer as ArrayBuffer;
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoded,
  );
  const combined = new Uint8Array(12 + ciphertextBuf.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ciphertextBuf), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(key: CryptoKey, encoded: string): Promise<string> {
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
 * Create a signed Nostr event (schnorr signature over SHA-256 of serialized event).
 */
export function signEvent(event: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}): { id: string; sig: string } {
  // NIP-01: event ID = SHA-256 of [0, pubkey, created_at, kind, tags, content]
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  const hash = sha256(new TextEncoder().encode(serialized));
  const id = bytesToHex(hash);
  const sig = bytesToHex(schnorr.sign(hash, hexToBytes(event.pubkey).length === 32
    ? hexToBytes(event.pubkey)
    : hexToBytes(event.pubkey) // already x-only
  ));
  return { id, sig };
}

/**
 * Create and sign a full Nostr event.
 */
export function createNostrEvent(
  privateKey: Uint8Array,
  pubkeyHex: string,
  kind: number,
  content: string,
  tags: string[][],
): {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
} {
  const created_at = Math.floor(Date.now() / 1000);

  // NIP-01: event ID
  const serialized = JSON.stringify([0, pubkeyHex, created_at, kind, tags, content]);
  const hash = sha256(new TextEncoder().encode(serialized));
  const id = bytesToHex(hash);
  const sig = bytesToHex(schnorr.sign(hash, privateKey));

  return { id, pubkey: pubkeyHex, created_at, kind, tags, content, sig };
}
