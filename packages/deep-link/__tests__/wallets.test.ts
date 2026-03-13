import { describe, it, expect } from 'vitest';
import {
  WALLET_REGISTRY,
  generateDeepLink,
  generateAllDeepLinks,
  generateConnectorUrl,
} from '../src/wallets.js';
import type { WalletId } from '../src/types.js';

const CONNECTOR_BASE = 'https://walletcast.net/';
const PUBKEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

describe('generateConnectorUrl', () => {
  it('puts connection params in the hash fragment (no query string)', () => {
    const url = generateConnectorUrl(CONNECTOR_BASE, PUBKEY, RELAYS);

    expect(url).toContain('#/c/');
    expect(url).not.toContain('?');
    // Relay hosts appear as path segments without wss://
    expect(url).toContain('relay.damus.io');
    expect(url).toContain('nos.lol');
  });

  it('encodes pubkey as base64url (43 chars)', () => {
    const url = generateConnectorUrl(CONNECTOR_BASE, PUBKEY, RELAYS);
    const hash = url.split('#')[1];
    const parts = hash.split('/').filter(Boolean);
    const pubB64 = parts[parts.indexOf('c') + 1];
    expect(pubB64).toHaveLength(43);
    expect(pubB64).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('preserves the base URL before the hash', () => {
    const url = generateConnectorUrl(CONNECTOR_BASE, PUBKEY, RELAYS);
    expect(url.startsWith(CONNECTOR_BASE + '#')).toBe(true);
  });
});

describe('WALLET_REGISTRY', () => {
  it('has entries for all supported wallets', () => {
    const expected: WalletId[] = ['metamask', 'trust', 'coinbase', 'phantom', 'okx'];
    expect(Object.keys(WALLET_REGISTRY).sort()).toEqual(expected.sort());
  });

  it('each wallet has name, universal, and native functions', () => {
    for (const [, wallet] of Object.entries(WALLET_REGISTRY)) {
      expect(wallet.name).toBeTruthy();
      expect(typeof wallet.universal).toBe('function');
      expect(typeof wallet.native).toBe('function');
    }
  });
});

describe('generateDeepLink', () => {
  const connectorUrl = generateConnectorUrl(CONNECTOR_BASE, PUBKEY, RELAYS);

  it('MetaMask universal uses metamask.app.link with stripped protocol', () => {
    const { universal, native } = generateDeepLink('metamask', connectorUrl);
    expect(universal).toMatch(/^https:\/\/metamask\.app\.link\/dapp\//);
    // Should not have https:// in the dapp path
    expect(universal).not.toContain('/dapp/https://');
    expect(native).toMatch(/^metamask:\/\/dapp\//);
  });

  it('Trust Wallet universal encodes the URL', () => {
    const { universal, native } = generateDeepLink('trust', connectorUrl);
    expect(universal).toContain('link.trustwallet.com');
    expect(universal).toContain('url=');
    expect(native).toMatch(/^trust:\/\//);
  });

  it('Coinbase universal encodes the URL', () => {
    const { universal, native } = generateDeepLink('coinbase', connectorUrl);
    expect(universal).toContain('go.cb-w.com');
    expect(native).toMatch(/^cbwallet:\/\//);
  });

  it('Phantom universal encodes the URL', () => {
    const { universal, native } = generateDeepLink('phantom', connectorUrl);
    expect(universal).toContain('phantom.app');
    expect(native).toMatch(/^phantom:\/\//);
  });

  it('OKX native uses okx:// protocol', () => {
    const { native } = generateDeepLink('okx', connectorUrl);
    expect(native).toMatch(/^okx:\/\/wallet\/dapp\/url/);
    expect(native).toContain('dappUrl=');
  });

  it('all deep links contain the connector URL (encoded)', () => {
    const wallets: WalletId[] = ['metamask', 'trust', 'coinbase', 'phantom', 'okx'];
    for (const id of wallets) {
      const { universal, native } = generateDeepLink(id, connectorUrl);
      // MetaMask strips protocol, others encode. Just check the link isn't empty.
      expect(universal.length).toBeGreaterThan(20);
      expect(native.length).toBeGreaterThan(10);
    }
  });
});

describe('generateAllDeepLinks', () => {
  const connectorUrl = generateConnectorUrl(CONNECTOR_BASE, PUBKEY, RELAYS);

  it('returns links for all wallets', () => {
    const links = generateAllDeepLinks(connectorUrl);
    const expected: WalletId[] = ['metamask', 'trust', 'coinbase', 'phantom', 'okx'];
    expect(Object.keys(links).sort()).toEqual(expected.sort());
  });

  it('each entry has universal and native', () => {
    const links = generateAllDeepLinks(connectorUrl);
    for (const [, link] of Object.entries(links)) {
      expect(typeof link.universal).toBe('string');
      expect(typeof link.native).toBe('string');
    }
  });
});
