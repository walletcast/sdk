import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  pubKeyFromPrivate,
  bytesToHex,
  hexToBytes,
} from '../src/index.js';

describe('generateKeyPair', () => {
  it('should generate a valid keypair', () => {
    const kp = generateKeyPair();

    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(33); // compressed
    expect(typeof kp.publicKeyHex).toBe('string');
    expect(kp.publicKeyHex.length).toBe(66); // 33 bytes * 2 hex chars
  });

  it('should generate unique keypairs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    expect(kp1.publicKeyHex).not.toBe(kp2.publicKeyHex);
  });

  it('should produce compressed public key starting with 02 or 03', () => {
    const kp = generateKeyPair();
    const prefix = kp.publicKeyHex.substring(0, 2);
    expect(['02', '03']).toContain(prefix);
  });

  it('publicKeyHex should match bytesToHex(publicKey)', () => {
    const kp = generateKeyPair();
    expect(kp.publicKeyHex).toBe(bytesToHex(kp.publicKey));
  });
});

describe('pubKeyFromPrivate', () => {
  it('should derive the same public key as generateKeyPair', () => {
    const kp = generateKeyPair();
    const derived = pubKeyFromPrivate(kp.privateKey);
    expect(bytesToHex(derived)).toBe(kp.publicKeyHex);
  });

  it('should produce a 33-byte compressed key', () => {
    const kp = generateKeyPair();
    const derived = pubKeyFromPrivate(kp.privateKey);
    expect(derived.length).toBe(33);
  });
});

describe('bytesToHex / hexToBytes', () => {
  it('should roundtrip bytes through hex', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const hex = bytesToHex(original);
    const roundtripped = hexToBytes(hex);
    expect(roundtripped).toEqual(original);
  });

  it('should handle empty arrays', () => {
    const empty = new Uint8Array(0);
    expect(bytesToHex(empty)).toBe('');
    expect(hexToBytes('')).toEqual(empty);
  });

  it('should throw on odd-length hex strings', () => {
    expect(() => hexToBytes('abc')).toThrow('even length');
  });

  it('should throw on invalid hex characters', () => {
    expect(() => hexToBytes('zz')).toThrow('Invalid hex');
  });
});
