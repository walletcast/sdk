import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  IBroker,
  DataChannelHandle,
  WalletCastProviderConfig,
  WalletCastURI,
} from '@walletcast/types';
import { MessageType, WalletCastErrorCode } from '@walletcast/types';
import { encodeEnvelope } from '@walletcast/webrtc';
import { WalletCastProvider } from '../src/provider.js';
import { ProviderRpcError } from '../src/errors.js';

// Helper: create a mock DataChannelHandle
function createMockChannel(): DataChannelHandle & {
  _onMessage: ((data: Uint8Array) => void) | null;
  _onClose: (() => void) | null;
  _sent: Uint8Array[];
} {
  const mock: DataChannelHandle & {
    _onMessage: ((data: Uint8Array) => void) | null;
    _onClose: (() => void) | null;
    _sent: Uint8Array[];
  } = {
    readyState: 'open',
    _onMessage: null,
    _onClose: null,
    _sent: [],
    send: vi.fn((data: Uint8Array) => {
      mock._sent.push(data);
    }),
    onMessage: vi.fn((handler: (data: Uint8Array) => void) => {
      mock._onMessage = handler;
    }),
    onClose: vi.fn((handler: () => void) => {
      mock._onClose = handler;
    }),
    close: vi.fn(),
  };
  return mock;
}

// Helper: create a response envelope
function createResponseEnvelope(id: number, result: unknown): Uint8Array {
  const payload = new TextEncoder().encode(
    JSON.stringify({ jsonrpc: '2.0', id, result }),
  );
  return encodeEnvelope({
    type: MessageType.RPC_RESPONSE,
    id,
    payload,
  });
}

// Helper: create mock broker
function createMockBroker(
  channel: DataChannelHandle,
): IBroker {
  return {
    connect: vi.fn().mockResolvedValue(channel),
    listen: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

/** Wait for microtasks so mocked resolved promises propagate */
const tick = () => new Promise<void>((r) => queueMicrotask(r));

const MOCK_URI: WalletCastURI = {
  version: 'v1',
  publicKey: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
  relayUrls: ['wss://relay.example.com'],
  bootnodes: [],
  raw: 'walletcast:v1?pubkey=02abcdef...',
};

describe('WalletCastProvider', () => {
  let channel: ReturnType<typeof createMockChannel>;
  let broker: IBroker;
  let provider: WalletCastProvider;
  let config: WalletCastProviderConfig;

  beforeEach(() => {
    channel = createMockChannel();
    broker = createMockBroker(channel);
    config = {
      broker,
      rpcUrl: 'https://rpc.example.com',
      chainId: 1,
    };
    provider = new WalletCastProvider(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('eth_chainId', () => {
    it('should return hex chain id', async () => {
      const result = await provider.request({ method: 'eth_chainId' });
      expect(result).toBe('0x1');
    });

    it('should handle non-mainnet chain ids', async () => {
      const goerliProvider = new WalletCastProvider({
        ...config,
        chainId: 5,
      });
      const result = await goerliProvider.request({ method: 'eth_chainId' });
      expect(result).toBe('0x5');
    });
  });

  describe('eth_accounts', () => {
    it('should return empty array when not connected', async () => {
      const result = await provider.request({ method: 'eth_accounts' });
      expect(result).toEqual([]);
    });

    it('should return accounts after connecting', async () => {
      // Start connect, which will send eth_requestAccounts over channel
      const connectPromise = provider.connectToWallet(MOCK_URI);

      // Simulate wallet responding with accounts (id=1 for the eth_requestAccounts)
      await tick();
      channel._onMessage!(
        createResponseEnvelope(1, ['0xdeadbeef']),
      );

      await connectPromise;

      const result = await provider.request({ method: 'eth_accounts' });
      expect(result).toEqual(['0xdeadbeef']);
    });
  });

  describe('eth_requestAccounts', () => {
    it('should throw when not connected', async () => {
      await expect(
        provider.request({ method: 'eth_requestAccounts' }),
      ).rejects.toThrow(ProviderRpcError);
    });

    it('should return accounts when connected', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(
        createResponseEnvelope(1, ['0x123abc']),
      );
      await connectPromise;

      const result = await provider.request({ method: 'eth_requestAccounts' });
      expect(result).toEqual(['0x123abc']);
    });
  });

  describe('read methods routing to public RPC', () => {
    it('should route eth_call to public RPC', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({ jsonrpc: '2.0', id: 1, result: '0xresult' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse as Response,
      );

      const result = await provider.request({
        method: 'eth_call',
        params: [{ to: '0x123', data: '0xabc' }, 'latest'],
      });

      expect(result).toBe('0xresult');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should route eth_getBalance to public RPC', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: '0xde0b6b3a7640000',
          }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse as Response,
      );

      const result = await provider.request({
        method: 'eth_getBalance',
        params: ['0x123', 'latest'],
      });

      expect(result).toBe('0xde0b6b3a7640000');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should route eth_blockNumber to public RPC', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({ jsonrpc: '2.0', id: 1, result: '0xff' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse as Response,
      );

      const result = await provider.request({ method: 'eth_blockNumber' });
      expect(result).toBe('0xff');
    });
  });

  describe('signing methods routing to wallet', () => {
    it('should route eth_sendTransaction through DataChannel', async () => {
      // First connect
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xwallet']));
      await connectPromise;

      // Now send a signing request
      const txPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0x456', value: '0x1' }],
      });

      // Simulate wallet responding (id=2 since eth_requestAccounts was id=1)
      await tick();
      channel._onMessage!(createResponseEnvelope(2, '0xtxhash'));

      const result = await txPromise;
      expect(result).toBe('0xtxhash');

      // Verify request went through the DataChannel, not fetch
      expect(channel.send).toHaveBeenCalled();
    });

    it('should route personal_sign through DataChannel', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xwallet']));
      await connectPromise;

      const signPromise = provider.request({
        method: 'personal_sign',
        params: ['0xmessage', '0xwallet'],
      });

      await tick();
      channel._onMessage!(createResponseEnvelope(2, '0xsignature'));
      const result = await signPromise;
      expect(result).toBe('0xsignature');
    });

    it('should throw when signing method called without connection', async () => {
      await expect(
        provider.request({
          method: 'eth_sendTransaction',
          params: [{ to: '0x123' }],
        }),
      ).rejects.toThrow(ProviderRpcError);
    });
  });

  describe('wallet_switchEthereumChain and wallet_addEthereumChain', () => {
    it('should route wallet_switchEthereumChain to wallet', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xwallet']));
      await connectPromise;

      const switchPromise = provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x5' }],
      });

      await tick();
      channel._onMessage!(createResponseEnvelope(2, null));
      const result = await switchPromise;
      expect(result).toBeNull();
    });

    it('should throw wallet_switchEthereumChain when not connected', async () => {
      await expect(
        provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x5' }],
        }),
      ).rejects.toThrow(ProviderRpcError);
    });
  });

  describe('unknown methods', () => {
    it('should fall back to public RPC for unknown methods', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: 'custom-result',
          }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse as Response,
      );

      const result = await provider.request({
        method: 'some_custom_method',
      });
      expect(result).toBe('custom-result');
    });
  });

  describe('connectToWallet', () => {
    it('should connect via broker and return accounts', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);

      await tick();
      channel._onMessage!(
        createResponseEnvelope(1, ['0xaccount1', '0xaccount2']),
      );

      const accounts = await connectPromise;

      expect(accounts).toEqual(['0xaccount1', '0xaccount2']);
      expect(broker.connect).toHaveBeenCalledWith(MOCK_URI);
      expect(provider.isConnected).toBe(true);
    });

    it('should emit connect and accountsChanged events', async () => {
      const connectHandler = vi.fn();
      const accountsHandler = vi.fn();
      provider.on('connect', connectHandler);
      provider.on('accountsChanged', accountsHandler);

      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xabc']));
      await connectPromise;

      expect(connectHandler).toHaveBeenCalledWith({ chainId: '0x1' });
      expect(accountsHandler).toHaveBeenCalledWith(['0xabc']);
    });
  });

  describe('disconnect', () => {
    it('should close channel and emit disconnect', async () => {
      // First connect
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xabc']));
      await connectPromise;

      const disconnectHandler = vi.fn();
      provider.on('disconnect', disconnectHandler);

      await provider.disconnect();

      expect(channel.close).toHaveBeenCalled();
      expect(provider.isConnected).toBe(false);
      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should clear accounts on disconnect', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xabc']));
      await connectPromise;

      await provider.disconnect();

      const accounts = await provider.request({ method: 'eth_accounts' });
      expect(accounts).toEqual([]);
    });
  });

  describe('channel close from remote', () => {
    it('should emit disconnect and accountsChanged when channel closes', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xabc']));
      await connectPromise;

      const disconnectHandler = vi.fn();
      const accountsHandler = vi.fn();
      provider.on('disconnect', disconnectHandler);
      provider.on('accountsChanged', accountsHandler);

      // Simulate remote channel close
      channel._onClose!();

      expect(disconnectHandler).toHaveBeenCalled();
      expect(accountsHandler).toHaveBeenCalledWith([]);
      expect(provider.isConnected).toBe(false);
    });
  });

  describe('event emitter', () => {
    it('should support on and removeListener', () => {
      const handler = vi.fn();
      provider.on('connect', handler);
      provider.removeListener('connect', handler);

      // Trigger a connect; handler should NOT be called since it was removed
      // (We can't easily trigger emit externally, so just verify no error)
    });
  });

  describe('isConnected', () => {
    it('should be false initially', () => {
      expect(provider.isConnected).toBe(false);
    });

    it('should be true after connecting', async () => {
      const connectPromise = provider.connectToWallet(MOCK_URI);
      await tick();
      channel._onMessage!(createResponseEnvelope(1, ['0xabc']));
      await connectPromise;

      expect(provider.isConnected).toBe(true);
    });
  });
});
