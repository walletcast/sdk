import { describe, it, expect } from 'vitest';
import { parseURI, generateURI, isValidURI } from '../src/index.js';

const VALID_PUBKEY =
  '02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('roundtrip: generate -> parse', () => {
  it('should roundtrip a basic URI', () => {
    const original = generateURI({ publicKey: VALID_PUBKEY });
    const parsed = parseURI(original);

    expect(parsed.version).toBe('v1');
    expect(parsed.publicKey).toBe(VALID_PUBKEY);
    expect(parsed.relayUrls).toEqual([]);
    expect(parsed.bootnodes).toEqual([]);
  });

  it('should roundtrip a URI with relays and bootnodes', () => {
    const relays = [
      'wss://relay1.example.com',
      'wss://relay2.example.com/path',
    ];
    const bootnodes = [
      '/ip4/192.168.1.1/tcp/4001/p2p/QmPeer1',
      '/dns4/boot.example.com/tcp/443/wss/p2p/QmPeer2',
    ];

    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: relays,
      bootnodes,
    });

    const parsed = parseURI(uri);
    expect(parsed.publicKey).toBe(VALID_PUBKEY);
    expect(parsed.relayUrls).toEqual(relays);
    expect(parsed.bootnodes).toEqual(bootnodes);
  });

  it('should roundtrip URIs with special characters in URLs', () => {
    const relays = ['wss://relay.example.com/path?key=value&other=true'];
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: relays,
    });

    const parsed = parseURI(uri);
    expect(parsed.relayUrls).toEqual(relays);
  });
});

describe('isValidURI', () => {
  it('should return true for valid URIs', () => {
    expect(isValidURI(`walletcast:v1:${VALID_PUBKEY}`)).toBe(true);
  });

  it('should return true for valid URIs with params', () => {
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: ['wss://relay.example.com'],
    });
    expect(isValidURI(uri)).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isValidURI('')).toBe(false);
  });

  it('should return false for wrong scheme', () => {
    expect(isValidURI(`walletconnect:v1:${VALID_PUBKEY}`)).toBe(false);
  });

  it('should return false for invalid pubkey', () => {
    expect(isValidURI('walletcast:v1:invalidpubkey')).toBe(false);
  });

  it('should return false for random strings', () => {
    expect(isValidURI('hello world')).toBe(false);
    expect(isValidURI('https://example.com')).toBe(false);
    expect(isValidURI('walletcast:v1')).toBe(false);
  });
});
