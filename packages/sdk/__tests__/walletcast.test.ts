import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---- hoisted mocks ----

const {
  mockGenerateKeyPair,
  MockNostrRpc,
  MockDeepLinkProvider,
  mockGenerateConnectorUrl,
  mockGenerateAllDeepLinks,
} = vi.hoisted(() => ({
  mockGenerateKeyPair: vi.fn().mockReturnValue({
    publicKey: new Uint8Array(33),
    privateKey: new Uint8Array(32),
    publicKeyHex: '02' + 'ab'.repeat(32),
  }),
  MockNostrRpc: vi.fn().mockImplementation(() => ({
    publicKey: 'ab'.repeat(32),
    subscribe: vi.fn(),
    send: vi.fn(),
    destroy: vi.fn(),
  })),
  MockDeepLinkProvider: vi.fn().mockImplementation(() => ({
    waitForSession: vi.fn().mockResolvedValue(['0xabc']),
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    disconnect: vi.fn(),
    onSessionCleared: null,
  })),
  mockGenerateConnectorUrl: vi.fn().mockReturnValue('https://example.com/walletcast/#pubkey=abc&relays=wss://r.io'),
  mockGenerateAllDeepLinks: vi.fn().mockReturnValue({
    metamask: { universal: 'https://metamask.app.link/dapp/example', native: 'metamask://dapp/example' },
    trust: { universal: 'https://link.trustwallet.com/open_url?url=example', native: 'trust://open_url?url=example' },
    coinbase: { universal: 'https://go.cb-w.com/dapp?url=example', native: 'cbwallet://dapp?url=example' },
    phantom: { universal: 'https://phantom.app/ul/browse/example', native: 'phantom://browse/example' },
    okx: { universal: 'https://okx.com/example', native: 'okx://wallet/dapp/url?example' },
  }),
}));

vi.mock('@walletcast/crypto', () => ({
  generateKeyPair: mockGenerateKeyPair,
  pubKeyFromPrivate: vi.fn().mockReturnValue(new Uint8Array(33)),
  hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
  bytesToHex: vi.fn().mockReturnValue('ab'.repeat(32)),
}));

vi.mock('@walletcast/deep-link', () => ({
  DeepLinkProvider: MockDeepLinkProvider,
  NostrRpc: MockNostrRpc,
  SessionManager: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockReturnValue(null),
    save: vi.fn(),
    clear: vi.fn(),
  })),
  generateConnectorUrl: mockGenerateConnectorUrl,
  generateAllDeepLinks: mockGenerateAllDeepLinks,
  WALLET_REGISTRY: {
    metamask: { name: 'MetaMask', universal: vi.fn(), native: vi.fn() },
  },
}));

vi.mock('@walletcast/provider', () => ({
  WalletCastProvider: vi.fn(),
  announceProvider: vi.fn(),
  ProviderRpcError: vi.fn(),
}));

// ---- import under test ----

import { WalletCast } from '../src/walletcast.js';
import { DEFAULT_NOSTR_RELAYS } from '../src/defaults.js';

// ---- tests ----

describe('WalletCast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- createDeepLinkProvider ----------

  describe('createDeepLinkProvider', () => {
    it('generates a keypair and creates NostrRpc', () => {
      WalletCast.createDeepLinkProvider({
        connectorUrl: 'https://example.com/walletcast/',
        rpcUrl: 'https://rpc.example',
        chainId: 1,
      });

      expect(mockGenerateKeyPair).toHaveBeenCalledOnce();
      expect(MockNostrRpc).toHaveBeenCalledOnce();
      expect(MockNostrRpc.mock.calls[0][0]).toEqual(DEFAULT_NOSTR_RELAYS);
    });

    it('creates DeepLinkProvider with rpcUrl and chainId', () => {
      WalletCast.createDeepLinkProvider({
        connectorUrl: 'https://example.com/walletcast/',
        rpcUrl: 'https://rpc.example',
        chainId: 42,
      });

      expect(MockDeepLinkProvider).toHaveBeenCalledOnce();
      expect(MockDeepLinkProvider.mock.calls[0][0]).toBe('https://rpc.example');
      expect(MockDeepLinkProvider.mock.calls[0][1]).toBe(42);
    });

    it('returns links, connectorUrl, pubkey, keypair, relays, and approval', () => {
      const result = WalletCast.createDeepLinkProvider({
        connectorUrl: 'https://example.com/walletcast/',
        rpcUrl: 'https://rpc.example',
        chainId: 1,
      });

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('links');
      expect(result).toHaveProperty('connectorUrl');
      expect(result).toHaveProperty('pubkey');
      expect(result).toHaveProperty('keypair');
      expect(result).toHaveProperty('relays');
      expect(result).toHaveProperty('approval');
      expect(result.relays).toEqual(DEFAULT_NOSTR_RELAYS);
    });

    it('uses custom nostrRelays when provided', () => {
      const customRelays = ['wss://custom.relay'];
      WalletCast.createDeepLinkProvider({
        connectorUrl: 'https://example.com/walletcast/',
        rpcUrl: 'https://rpc.example',
        chainId: 1,
        nostrRelays: customRelays,
      });

      expect(MockNostrRpc.mock.calls[0][0]).toEqual(customRelays);
    });

    it('generates deep links for all wallets', () => {
      WalletCast.createDeepLinkProvider({
        connectorUrl: 'https://example.com/walletcast/',
        rpcUrl: 'https://rpc.example',
        chainId: 1,
      });

      expect(mockGenerateAllDeepLinks).toHaveBeenCalledOnce();
    });
  });

  // ---------- generateKeyPair ----------

  describe('generateKeyPair', () => {
    it('delegates to @walletcast/crypto generateKeyPair', () => {
      const kp = WalletCast.generateKeyPair();

      expect(mockGenerateKeyPair).toHaveBeenCalledOnce();
      expect(kp).toHaveProperty('publicKey');
      expect(kp).toHaveProperty('privateKey');
      expect(kp).toHaveProperty('publicKeyHex');
    });
  });

  // ---------- defaults ----------

  describe('defaults', () => {
    it('DEFAULT_NOSTR_RELAYS contains expected relay URLs', () => {
      expect(DEFAULT_NOSTR_RELAYS).toEqual([
        'wss://relay.damus.io',
        'wss://nos.lol',
      ]);
    });
  });

  // ---------- connect ----------

  describe('connect', () => {
    it('is a static method', () => {
      expect(typeof WalletCast.connect).toBe('function');
    });

    it('detectInjectedWallet is a static method', () => {
      expect(typeof WalletCast.detectInjectedWallet).toBe('function');
    });
  });
});
