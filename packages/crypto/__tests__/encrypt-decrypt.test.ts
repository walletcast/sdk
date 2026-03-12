import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  computeSharedSecret,
  encryptForPeer,
  decryptFromPeer,
  encryptPayload,
  decryptPayload,
} from '../src/index.js';

describe('computeSharedSecret', () => {
  it('should produce the same shared secret from both sides', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const secretAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const secretBA = computeSharedSecret(bob.privateKey, alice.publicKey);

    expect(secretAB).toEqual(secretBA);
  });

  it('should produce a 32-byte shared secret', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const secret = computeSharedSecret(alice.privateKey, bob.publicKey);
    expect(secret.length).toBe(32);
  });

  it('should produce different secrets for different keypairs', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const carol = generateKeyPair();

    const secretAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const secretAC = computeSharedSecret(alice.privateKey, carol.publicKey);

    expect(secretAB).not.toEqual(secretAC);
  });
});

describe('encryptForPeer / decryptFromPeer', () => {
  it('should encrypt and decrypt a message between peers', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const message = 'Hello, Bob! This is Alice.';

    const encrypted = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      message,
    );
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(message);

    const decrypted = await decryptFromPeer(
      bob.privateKey,
      alice.publicKey,
      encrypted,
    );
    expect(decrypted).toBe(message);
  });

  it('should handle empty messages', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const encrypted = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      '',
    );
    const decrypted = await decryptFromPeer(
      bob.privateKey,
      alice.publicKey,
      encrypted,
    );
    expect(decrypted).toBe('');
  });

  it('should handle unicode messages', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const message = 'Hello from the blockchain world! Salud!';

    const encrypted = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      message,
    );
    const decrypted = await decryptFromPeer(
      bob.privateKey,
      alice.publicKey,
      encrypted,
    );
    expect(decrypted).toBe(message);
  });

  it('should fail to decrypt with wrong private key', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const eve = generateKeyPair();

    const encrypted = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      'secret message',
    );

    await expect(
      decryptFromPeer(eve.privateKey, alice.publicKey, encrypted),
    ).rejects.toThrow();
  });

  it('should produce different ciphertexts for the same plaintext (random nonce)', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const message = 'same message';

    const encrypted1 = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      message,
    );
    const encrypted2 = await encryptForPeer(
      alice.privateKey,
      bob.publicKey,
      message,
    );

    expect(encrypted1).not.toBe(encrypted2);
  });
});

describe('encryptPayload / decryptPayload', () => {
  it('should encrypt and decrypt with structured payload', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const message = 'Structured payload test';

    const payload = await encryptPayload(
      alice.privateKey,
      bob.publicKey,
      message,
    );

    expect(payload.ciphertext).toBeInstanceOf(Uint8Array);
    expect(payload.nonce).toBeInstanceOf(Uint8Array);
    expect(payload.mac).toBeInstanceOf(Uint8Array);
    expect(payload.nonce.length).toBe(12);
    expect(payload.mac.length).toBe(16);

    const decrypted = await decryptPayload(
      bob.privateKey,
      alice.publicKey,
      payload,
    );
    expect(decrypted).toBe(message);
  });

  it('should fail to decrypt a tampered ciphertext', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const payload = await encryptPayload(
      alice.privateKey,
      bob.publicKey,
      'tamper test',
    );

    // Tamper with the ciphertext
    payload.ciphertext[0] ^= 0xff;

    await expect(
      decryptPayload(bob.privateKey, alice.publicKey, payload),
    ).rejects.toThrow();
  });

  it('should fail to decrypt with tampered MAC', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const payload = await encryptPayload(
      alice.privateKey,
      bob.publicKey,
      'mac tamper test',
    );

    // Tamper with the MAC
    payload.mac[0] ^= 0xff;

    await expect(
      decryptPayload(bob.privateKey, alice.publicKey, payload),
    ).rejects.toThrow();
  });
});
