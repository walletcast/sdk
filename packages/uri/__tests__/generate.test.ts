import { describe, it, expect } from 'vitest';
import { generateURI } from '../src/index.js';

const VALID_PUBKEY =
  '02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('generateURI', () => {
  it('should generate a basic URI without params', () => {
    const uri = generateURI({ publicKey: VALID_PUBKEY });
    expect(uri).toBe(`walletcast:v1:${VALID_PUBKEY}`);
  });

  it('should generate a URI with relay URLs', () => {
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
    });

    expect(uri).toContain('walletcast:v1:');
    expect(uri).toContain(VALID_PUBKEY);
    expect(uri).toContain(
      `r=${encodeURIComponent('wss://relay1.example.com')}`,
    );
    expect(uri).toContain(
      `r=${encodeURIComponent('wss://relay2.example.com')}`,
    );
  });

  it('should generate a URI with bootnodes', () => {
    const bootnode = '/ip4/127.0.0.1/tcp/4001/p2p/QmPeer1';
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      bootnodes: [bootnode],
    });

    expect(uri).toContain(`b=${encodeURIComponent(bootnode)}`);
  });

  it('should generate a URI with both relays and bootnodes', () => {
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: ['wss://relay.example.com'],
      bootnodes: ['/ip4/127.0.0.1/tcp/4001/p2p/QmPeer1'],
    });

    expect(uri).toContain('r=');
    expect(uri).toContain('b=');
    // Relays should come before bootnodes
    const rIndex = uri.indexOf('r=');
    const bIndex = uri.indexOf('b=');
    expect(rIndex).toBeLessThan(bIndex);
  });

  it('should normalize public key to lowercase', () => {
    const uri = generateURI({ publicKey: VALID_PUBKEY.toUpperCase() });
    expect(uri).toContain(VALID_PUBKEY.toLowerCase());
  });

  it('should handle empty relay and bootnode arrays', () => {
    const uri = generateURI({
      publicKey: VALID_PUBKEY,
      relayUrls: [],
      bootnodes: [],
    });

    expect(uri).toBe(`walletcast:v1:${VALID_PUBKEY}`);
    expect(uri).not.toContain('?');
  });
});
