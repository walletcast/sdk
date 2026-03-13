import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepLinkProvider } from '../src/deep-link-provider.js';
import type { NostrRpc } from '../src/nostr-rpc.js';
import type { NostrRpcMessage } from '../src/types.js';

// Mock @walletcast/provider to avoid fetch calls
vi.mock('@walletcast/provider', () => {
  const mockSendToPublicRPC = vi.fn().mockResolvedValue('0x1');
  return {
    RpcRouter: vi.fn().mockImplementation(() => ({
      sendToPublicRPC: mockSendToPublicRPC,
    })),
    ProviderEventEmitter: vi.fn().mockImplementation(() => {
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      return {
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        }),
        removeListener: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        }),
        emit: vi.fn((event: string, ...args: unknown[]) => {
          for (const fn of listeners[event] || []) fn(...args);
        }),
      };
    }),
    ProviderRpcError: class extends Error {
      code: number;
      constructor(code: number, message: string) {
        super(message);
        this.code = code;
      }
    },
  };
});

function createMockNostrRpc() {
  let messageHandler: ((msg: NostrRpcMessage, sender: string) => void) | null = null;
  const sendMock = vi.fn().mockResolvedValue(undefined);
  const subscribeMock = vi.fn().mockImplementation(
    async (onMsg: (msg: NostrRpcMessage, sender: string) => void) => {
      messageHandler = onMsg;
      return () => { messageHandler = null; };
    },
  );
  const destroyMock = vi.fn().mockResolvedValue(undefined);

  return {
    publicKey: 'dapp-pubkey-hex-64chars-' + '0'.repeat(40),
    send: sendMock,
    subscribe: subscribeMock,
    destroy: destroyMock,
    sendMock,
    subscribeMock,
    destroyMock,
    triggerMessage: (msg: NostrRpcMessage, sender: string) => {
      if (messageHandler) messageHandler(msg, sender);
    },
  };
}

const WALLET_PUBKEY = 'wallet-pubkey-' + '0'.repeat(50);

/** Flush microtask queue so async subscribe resolves */
async function flushMicrotasks() {
  // Promise.resolve() flushes microtasks without using setTimeout (which is captured by fake timers)
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Connect a provider: waitForSession + trigger session + flush */
async function connectProvider(
  provider: DeepLinkProvider,
  rpc: ReturnType<typeof createMockNostrRpc>,
) {
  const sessionPromise = provider.waitForSession();
  await flushMicrotasks();
  rpc.triggerMessage(
    { type: 'session', accounts: ['0xabc123'], chainId: '0x1' },
    WALLET_PUBKEY,
  );
  return sessionPromise;
}

describe('DeepLinkProvider', () => {
  let provider: DeepLinkProvider;
  let rpc: ReturnType<typeof createMockNostrRpc>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    rpc = createMockNostrRpc();
    provider = new DeepLinkProvider('https://eth.llamarpc.com', 1, rpc as unknown as NostrRpc);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('waitForSession', () => {
    it('resolves with accounts when session message is received', async () => {
      const accounts = await connectProvider(provider, rpc);
      expect(accounts).toEqual(['0xabc123']);
    });

    it('rejects on timeout', async () => {
      const sessionPromise = provider.waitForSession(5000);
      await flushMicrotasks();

      // Attach catch before advancing timers to avoid unhandled rejection
      const resultPromise = sessionPromise.catch((err: Error) => err);
      await vi.advanceTimersByTimeAsync(5001);

      const err = await resultPromise;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timeout/i);
    });
  });

  describe('request', () => {
    beforeEach(async () => {
      await connectProvider(provider, rpc);
      rpc.sendMock.mockClear();
    });

    it('eth_chainId returns cached chain ID', async () => {
      const result = await provider.request({ method: 'eth_chainId' });
      expect(result).toBe('0x1');
    });

    it('eth_accounts returns cached accounts', async () => {
      const result = await provider.request({ method: 'eth_accounts' });
      expect(result).toEqual(['0xabc123']);
    });

    it('eth_requestAccounts returns accounts when connected', async () => {
      const result = await provider.request({ method: 'eth_requestAccounts' });
      expect(result).toEqual(['0xabc123']);
    });

    it('signing methods are sent via NostrRpc', async () => {
      const requestPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: '0xabc123', to: '0xdef', value: '0x1' }],
      });

      await flushMicrotasks();

      // Find the request call (skip any ping calls)
      const requestCall = rpc.sendMock.mock.calls.find(
        (c: unknown[]) => (c[1] as NostrRpcMessage).type === 'request',
      );
      expect(requestCall).toBeTruthy();

      const sentMessage = requestCall![1] as { id: number };
      rpc.triggerMessage(
        { type: 'response', id: sentMessage.id, result: '0xtxhash' },
        WALLET_PUBKEY,
      );

      const result = await requestPromise;
      expect(result).toBe('0xtxhash');
    });

    it('handles error responses from wallet', async () => {
      const requestPromise = provider.request({
        method: 'personal_sign',
        params: ['0xmessage', '0xabc123'],
      });

      await flushMicrotasks();

      const requestCall = rpc.sendMock.mock.calls.find(
        (c: unknown[]) => (c[1] as NostrRpcMessage).type === 'request',
      );
      const sentMessage = requestCall![1] as { id: number };

      rpc.triggerMessage(
        {
          type: 'response',
          id: sentMessage.id,
          error: { code: 4001, message: 'User rejected the request' },
        },
        WALLET_PUBKEY,
      );

      await expect(requestPromise).rejects.toThrow('User rejected');
    });

    it('times out pending requests after 60s', async () => {
      const requestPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: '0xabc123', to: '0xdef' }],
      });

      // Attach catch before advancing timers to avoid unhandled rejection
      const resultPromise = requestPromise.catch((err: Error) => err);
      await vi.advanceTimersByTimeAsync(60_001);

      const err = await resultPromise;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timeout/i);
    });
  });

  describe('events', () => {
    beforeEach(async () => {
      await connectProvider(provider, rpc);
    });

    it('emits accountsChanged on event message', () => {
      const handler = vi.fn();
      provider.on('accountsChanged', handler);

      rpc.triggerMessage(
        { type: 'event', name: 'accountsChanged', data: ['0xnew'] },
        WALLET_PUBKEY,
      );

      expect(handler).toHaveBeenCalledWith(['0xnew']);
    });

    it('updates cached accounts on accountsChanged', async () => {
      rpc.triggerMessage(
        { type: 'event', name: 'accountsChanged', data: ['0xnew'] },
        WALLET_PUBKEY,
      );

      const accounts = await provider.request({ method: 'eth_accounts' });
      expect(accounts).toEqual(['0xnew']);
    });

    it('updates cached chainId on chainChanged', async () => {
      rpc.triggerMessage(
        { type: 'event', name: 'chainChanged', data: '0x89' },
        WALLET_PUBKEY,
      );

      const chainId = await provider.request({ method: 'eth_chainId' });
      expect(chainId).toBe('0x89');
    });
  });

  describe('heartbeat', () => {
    beforeEach(async () => {
      await connectProvider(provider, rpc);
      rpc.sendMock.mockClear();
    });

    it('sends ping every 15 seconds', async () => {
      await vi.advanceTimersByTimeAsync(15_001);

      const pingCalls = rpc.sendMock.mock.calls.filter(
        (c: unknown[]) => (c[1] as NostrRpcMessage).type === 'ping',
      );
      expect(pingCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('detects disconnect when no pong after 45s', async () => {
      const handler = vi.fn();
      provider.on('disconnect', handler);

      // Advance past heartbeat timeout (45s + next check at 15s intervals)
      await vi.advanceTimersByTimeAsync(60_001);

      expect(handler).toHaveBeenCalled();
      expect(provider.isConnected).toBe(false);
    });

    it('stays connected when pong is received', async () => {
      await vi.advanceTimersByTimeAsync(14_000);
      rpc.triggerMessage({ type: 'pong' }, WALLET_PUBKEY);

      await vi.advanceTimersByTimeAsync(14_000);
      rpc.triggerMessage({ type: 'pong' }, WALLET_PUBKEY);

      await vi.advanceTimersByTimeAsync(14_000);
      rpc.triggerMessage({ type: 'pong' }, WALLET_PUBKEY);

      expect(provider.isConnected).toBe(true);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await connectProvider(provider, rpc);
    });

    it('cleans up resources on disconnect', async () => {
      await provider.disconnect();

      expect(provider.isConnected).toBe(false);
      expect(rpc.destroyMock).toHaveBeenCalled();
    });

    it('rejects pending requests on disconnect', async () => {
      const requestPromise = provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: '0xabc123' }],
      });

      await flushMicrotasks();
      await provider.disconnect();

      await expect(requestPromise).rejects.toThrow('Disconnected');
    });
  });
});
