import { vi } from 'vitest';

// ---- hoisted mocks (available inside vi.mock factories) ----

const {
  mockGenerateKeyPair,
  MockSovereignBroker,
  MockWalletCastProvider,
  mockGenerateURI,
  mockParseURI,
} = vi.hoisted(() => ({
  mockGenerateKeyPair: vi.fn().mockReturnValue({
    publicKey: new Uint8Array(33),
    privateKey: new Uint8Array(32),
    publicKeyHex: '02' + 'ab'.repeat(32),
  }),
  MockSovereignBroker: vi.fn(),
  MockWalletCastProvider: vi.fn(),
  mockGenerateURI: vi.fn().mockReturnValue('walletcast:v1:02aabb'),
  mockParseURI: vi.fn().mockReturnValue({
    version: 'v1',
    publicKey: '02aabb',
    relayUrls: [],
    bootnodes: [],
    raw: 'walletcast:v1:02aabb',
  }),
}));

vi.mock('@walletcast/crypto', () => ({
  generateKeyPair: mockGenerateKeyPair,
}));

vi.mock('@walletcast/broker', () => ({
  SovereignBroker: MockSovereignBroker,
}));

vi.mock('@walletcast/provider', () => ({
  WalletCastProvider: MockWalletCastProvider,
}));

vi.mock('@walletcast/uri', () => ({
  generateURI: mockGenerateURI,
  parseURI: mockParseURI,
}));

// ---- import under test (after mocks) ----

import { WalletCast } from '../src/walletcast.js';
import {
  DEFAULT_NOSTR_RELAYS,
  DEFAULT_ICE_SERVERS,
} from '../src/defaults.js';

// ---- tests ----

describe('WalletCast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- createProvider ----------

  describe('createProvider', () => {
    it('instantiates SovereignBroker with generated keypair and default relays/ice servers', () => {
      WalletCast.createProvider({ rpcUrl: 'https://rpc.example', chainId: 1 });

      expect(mockGenerateKeyPair).toHaveBeenCalledOnce();

      expect(MockSovereignBroker).toHaveBeenCalledOnce();
      const brokerArgs = MockSovereignBroker.mock.calls[0][0];
      expect(brokerArgs.keypair).toEqual(mockGenerateKeyPair.mock.results[0].value);
      expect(brokerArgs.nostrRelays).toEqual(DEFAULT_NOSTR_RELAYS);
      expect(brokerArgs.iceServers).toEqual(DEFAULT_ICE_SERVERS);
    });

    it('instantiates WalletCastProvider with broker, rpcUrl and chainId', () => {
      WalletCast.createProvider({ rpcUrl: 'https://rpc.example', chainId: 42 });

      expect(MockWalletCastProvider).toHaveBeenCalledOnce();
      const providerArgs = MockWalletCastProvider.mock.calls[0][0];
      expect(providerArgs.broker).toBeInstanceOf(MockSovereignBroker);
      expect(providerArgs.rpcUrl).toBe('https://rpc.example');
      expect(providerArgs.chainId).toBe(42);
    });

    it('returns an instance of WalletCastProvider', () => {
      const result = WalletCast.createProvider({ rpcUrl: 'https://rpc.example', chainId: 1 });
      expect(result).toBeInstanceOf(MockWalletCastProvider);
    });

    it('uses custom nostrRelays when provided', () => {
      const customRelays = ['wss://custom.relay'];
      WalletCast.createProvider({
        rpcUrl: 'https://rpc.example',
        chainId: 1,
        nostrRelays: customRelays,
      });

      const brokerArgs = MockSovereignBroker.mock.calls[0][0];
      expect(brokerArgs.nostrRelays).toEqual(customRelays);
    });

    it('uses custom iceServers when provided', () => {
      const customIce: RTCIceServer[] = [{ urls: 'stun:custom.stun:3478' }];
      WalletCast.createProvider({
        rpcUrl: 'https://rpc.example',
        chainId: 1,
        iceServers: customIce,
      });

      const brokerArgs = MockSovereignBroker.mock.calls[0][0];
      expect(brokerArgs.iceServers).toEqual(customIce);
    });

    it('uses default nostrRelays and iceServers when options are omitted', () => {
      WalletCast.createProvider({ rpcUrl: 'https://rpc.example', chainId: 1 });

      const brokerArgs = MockSovereignBroker.mock.calls[0][0];
      expect(brokerArgs.nostrRelays).toBe(DEFAULT_NOSTR_RELAYS);
      expect(brokerArgs.iceServers).toBe(DEFAULT_ICE_SERVERS);
    });
  });

  // ---------- generateURI ----------

  describe('generateURI', () => {
    it('delegates to the uri package generateURI', () => {
      const opts = { publicKey: '02aabb' };
      const result = WalletCast.generateURI(opts);

      expect(mockGenerateURI).toHaveBeenCalledOnce();
      expect(mockGenerateURI).toHaveBeenCalledWith(opts);
      expect(result).toBe('walletcast:v1:02aabb');
    });
  });

  // ---------- parseURI ----------

  describe('parseURI', () => {
    it('delegates to the uri package parseURI', () => {
      const uri = 'walletcast:v1:02aabb';
      const result = WalletCast.parseURI(uri);

      expect(mockParseURI).toHaveBeenCalledOnce();
      expect(mockParseURI).toHaveBeenCalledWith(uri);
      expect(result).toEqual({
        version: 'v1',
        publicKey: '02aabb',
        relayUrls: [],
        bootnodes: [],
        raw: 'walletcast:v1:02aabb',
      });
    });
  });

  // ---------- generateKeyPair ----------

  describe('generateKeyPair', () => {
    it('delegates to @walletcast/crypto generateKeyPair and returns a valid keypair', () => {
      const kp = WalletCast.generateKeyPair();

      expect(mockGenerateKeyPair).toHaveBeenCalledOnce();
      expect(kp).toHaveProperty('publicKey');
      expect(kp).toHaveProperty('privateKey');
      expect(kp).toHaveProperty('publicKeyHex');
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(typeof kp.publicKeyHex).toBe('string');
    });
  });

  // ---------- defaults ----------

  describe('defaults', () => {
    it('DEFAULT_NOSTR_RELAYS contains expected relay URLs', () => {
      expect(DEFAULT_NOSTR_RELAYS).toEqual([
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.nostr.band',
      ]);
    });

    it('DEFAULT_ICE_SERVERS contains expected STUN servers', () => {
      expect(DEFAULT_ICE_SERVERS).toEqual([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ]);
    });
  });
});
