import { describe, it, expect } from 'vitest';
import { parseURI } from '../src/index.js';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';

// Valid 66-char compressed pubkey (starts with 02)
const VALID_PUBKEY =
  '02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('parseURI', () => {
  it('should parse a basic URI without query params', () => {
    const uri = `walletcast:v1:${VALID_PUBKEY}`;
    const result = parseURI(uri);

    expect(result.version).toBe('v1');
    expect(result.publicKey).toBe(VALID_PUBKEY);
    expect(result.relayUrls).toEqual([]);
    expect(result.bootnodes).toEqual([]);
    expect(result.raw).toBe(uri);
  });

  it('should parse a URI with relay URLs', () => {
    const uri = `walletcast:v1:${VALID_PUBKEY}?r=${encodeURIComponent('wss://relay1.example.com')}&r=${encodeURIComponent('wss://relay2.example.com')}`;
    const result = parseURI(uri);

    expect(result.relayUrls).toEqual([
      'wss://relay1.example.com',
      'wss://relay2.example.com',
    ]);
    expect(result.bootnodes).toEqual([]);
  });

  it('should parse a URI with bootnodes', () => {
    const bootnode = '/ip4/127.0.0.1/tcp/4001/p2p/QmPeer1';
    const uri = `walletcast:v1:${VALID_PUBKEY}?b=${encodeURIComponent(bootnode)}`;
    const result = parseURI(uri);

    expect(result.bootnodes).toEqual([bootnode]);
    expect(result.relayUrls).toEqual([]);
  });

  it('should parse a URI with both relay URLs and bootnodes', () => {
    const relay = 'wss://relay.example.com';
    const bootnode = '/ip4/127.0.0.1/tcp/4001/p2p/QmPeer1';
    const uri = `walletcast:v1:${VALID_PUBKEY}?r=${encodeURIComponent(relay)}&b=${encodeURIComponent(bootnode)}`;
    const result = parseURI(uri);

    expect(result.relayUrls).toEqual([relay]);
    expect(result.bootnodes).toEqual([bootnode]);
  });

  it('should normalize public key to lowercase', () => {
    const upperPubkey = VALID_PUBKEY.toUpperCase();
    const uri = `walletcast:v1:${upperPubkey}`;
    const result = parseURI(uri);
    expect(result.publicKey).toBe(VALID_PUBKEY.toLowerCase());
  });

  it('should throw on empty string', () => {
    expect(() => parseURI('')).toThrow(WalletCastError);
    try {
      parseURI('');
    } catch (e) {
      expect((e as WalletCastError).code).toBe(
        WalletCastErrorCode.INVALID_URI,
      );
    }
  });

  it('should throw on wrong scheme', () => {
    expect(() => parseURI(`walletconnect:v1:${VALID_PUBKEY}`)).toThrow(
      WalletCastError,
    );
  });

  it('should throw on wrong version', () => {
    expect(() => parseURI(`walletcast:v2:${VALID_PUBKEY}`)).toThrow(
      WalletCastError,
    );
  });

  it('should throw on invalid public key (wrong length)', () => {
    expect(() => parseURI('walletcast:v1:02abcdef')).toThrow(WalletCastError);
  });

  it('should throw on invalid public key (wrong prefix)', () => {
    // 66 chars but starts with 04 (uncompressed prefix)
    const badPubkey =
      '04a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    expect(() => parseURI(`walletcast:v1:${badPubkey}`)).toThrow(
      WalletCastError,
    );
  });

  it('should throw on missing segments', () => {
    expect(() => parseURI('walletcast:v1')).toThrow(WalletCastError);
  });

  it('should throw on too many segments', () => {
    expect(() =>
      parseURI(`walletcast:v1:${VALID_PUBKEY}:extra`),
    ).toThrow(WalletCastError);
  });
});
