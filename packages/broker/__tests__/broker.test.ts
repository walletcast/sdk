import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  DataChannelHandle,
  SignalingMessage,
  WalletCastURI,
  KeyPair,
} from '@walletcast/types';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';

// Mock all dependencies
vi.mock('@walletcast/nostr-signaling', () => ({
  NostrSignaler: vi.fn().mockImplementation(() => mockNostrSignaler),
}));

vi.mock('@walletcast/libp2p-signaling', () => ({
  LibP2PSignaler: vi.fn().mockImplementation(() => mockLibP2PSignaler),
}));

vi.mock('@walletcast/webrtc', () => ({
  WalletCastPeerConnection: vi.fn().mockImplementation(() => mockPeerConnection),
}));

vi.mock('@walletcast/crypto', () => ({
  randomBytes: () => new Uint8Array(16).fill(0xab),
  bytesToHex: () => 'ab'.repeat(16),
}));

const createMockChannel = (state: string = 'open'): DataChannelHandle => ({
  send: vi.fn(),
  onMessage: vi.fn(),
  onClose: vi.fn(),
  close: vi.fn(),
  get readyState() {
    return state as DataChannelHandle['readyState'];
  },
});

let mockNostrSignaler: {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

let mockLibP2PSignaler: {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

let mockPeerConnection: {
  createOffer: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  setRemoteAnswer: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

const mockKeypair: KeyPair = {
  publicKey: new Uint8Array(33).fill(2),
  privateKey: new Uint8Array(32).fill(1),
  publicKeyHex: '02' + '01'.repeat(32),
};

const mockUri: WalletCastURI = {
  version: 'v1',
  publicKey: '03' + 'ff'.repeat(32),
  relayUrls: ['wss://relay.test'],
  bootnodes: [],
  raw: 'walletcast:v1:03' + 'ff'.repeat(32),
};

beforeEach(() => {
  vi.clearAllMocks();

  mockNostrSignaler = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  mockLibP2PSignaler = {
    publish: vi.fn().mockRejectedValue(new Error('not implemented')),
    subscribe: vi.fn().mockResolvedValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  const channel = createMockChannel('open');
  mockPeerConnection = {
    createOffer: vi.fn().mockResolvedValue({
      sdp: 'v=0\r\noffer-sdp',
      dataChannel: channel,
    }),
    createAnswer: vi.fn().mockResolvedValue({
      sdp: 'v=0\r\nanswer-sdp',
      dataChannel: channel,
    }),
    setRemoteAnswer: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
});

describe('SovereignBroker', () => {
  it('should create a broker instance', async () => {
    const { SovereignBroker } = await import('../src/broker.js');
    const broker = new SovereignBroker({
      keypair: mockKeypair,
      nostrRelays: ['wss://relay.test'],
    });
    expect(broker).toBeDefined();
  });

  describe('connect()', () => {
    it('publishes offer and waits for answer', async () => {
      // Simulate the nostr signaler delivering an answer
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          // Deliver answer immediately
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'answer',
                sdp: 'v=0\r\nanswer-sdp',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 5000,
      });

      const channel = await broker.connect(mockUri);

      expect(channel).toBeDefined();
      expect(mockPeerConnection.createOffer).toHaveBeenCalled();
      expect(mockNostrSignaler.publish).toHaveBeenCalled();
      expect(mockPeerConnection.setRemoteAnswer).toHaveBeenCalledWith(
        'v=0\r\nanswer-sdp',
      );
    });

    it('publishes offer with correct sender and recipient keys', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'answer',
                sdp: 'v=0\r\nanswer-sdp',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 5000,
      });

      await broker.connect(mockUri);

      const publishedMsg = mockNostrSignaler.publish.mock
        .calls[0][0] as SignalingMessage;
      expect(publishedMsg.kind).toBe('sdp');
      expect(publishedMsg.payload.type).toBe('offer');
      expect(publishedMsg.payload.senderPubKey).toBe(mockKeypair.publicKeyHex);
      expect(publishedMsg.payload.recipientPubKey).toBe(mockUri.publicKey);
    });

    it('times out if no answer received', async () => {
      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 100,
      });

      await expect(broker.connect(mockUri)).rejects.toMatchObject({
        code: WalletCastErrorCode.SIGNALING_TIMEOUT,
      });
    });

    it('rejects with WalletCastError on timeout', async () => {
      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 50,
      });

      try {
        await broker.connect(mockUri);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WalletCastError);
        expect((err as WalletCastError).code).toBe(
          WalletCastErrorCode.SIGNALING_TIMEOUT,
        );
        expect((err as WalletCastError).message).toContain('50ms');
      }
    });

    it('ignores non-answer signaling messages while waiting', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            // Send an offer (not an answer) — should be ignored
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'offer',
                sdp: 'wrong',
                senderPubKey: 'someone',
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'x',
                timestamp: Date.now(),
              },
            });
          }, 5);
          setTimeout(() => {
            // Send an ICE message — should be ignored
            onMessage({
              kind: 'ice',
              payload: {
                candidate: 'candidate',
                sdpMid: '0',
                sdpMLineIndex: 0,
                senderPubKey: 'someone',
              },
            });
          }, 10);
          setTimeout(() => {
            // Finally send a proper answer
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'answer',
                sdp: 'v=0\r\ncorrect-answer',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test',
                timestamp: Date.now(),
              },
            });
          }, 15);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 5000,
      });

      const channel = await broker.connect(mockUri);
      expect(channel).toBeDefined();
      expect(mockPeerConnection.setRemoteAnswer).toHaveBeenCalledWith(
        'v=0\r\ncorrect-answer',
      );
    });
  });

  describe('listen()', () => {
    it('subscribes and handles incoming offers', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'offer',
                sdp: 'v=0\r\noffer-sdp',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test-nonce',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      const onIncoming = vi.fn();
      await broker.listen(onIncoming);

      // Wait for the async offer handling
      await new Promise((r) => setTimeout(r, 100));

      expect(mockPeerConnection.createAnswer).toHaveBeenCalledWith(
        'v=0\r\noffer-sdp',
      );
      expect(mockNostrSignaler.publish).toHaveBeenCalled();
      expect(onIncoming).toHaveBeenCalled();
    });

    it('sends answer back with correct keys and nonce', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'offer',
                sdp: 'v=0\r\noffer-sdp',
                senderPubKey: 'remote-sender-key',
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'original-nonce',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      await broker.listen(vi.fn());
      await new Promise((r) => setTimeout(r, 100));

      const answerMsg = mockNostrSignaler.publish.mock
        .calls[0][0] as SignalingMessage;
      expect(answerMsg.kind).toBe('sdp');
      expect(answerMsg.payload.type).toBe('answer');
      expect(answerMsg.payload.senderPubKey).toBe(mockKeypair.publicKeyHex);
      expect(answerMsg.payload.recipientPubKey).toBe('remote-sender-key');
      expect(answerMsg.payload.nonce).toBe('original-nonce');
    });

    it('ignores non-offer messages', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'answer',
                sdp: 'v=0\r\nanswer',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'x',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      const onIncoming = vi.fn();
      await broker.listen(onIncoming);

      await new Promise((r) => setTimeout(r, 100));
      expect(onIncoming).not.toHaveBeenCalled();
    });

    it('ignores ICE messages', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'ice',
              payload: {
                candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 12345 typ host',
                sdpMid: '0',
                sdpMLineIndex: 0,
                senderPubKey: mockUri.publicKey,
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      const onIncoming = vi.fn();
      await broker.listen(onIncoming);

      await new Promise((r) => setTimeout(r, 100));
      expect(onIncoming).not.toHaveBeenCalled();
      expect(mockPeerConnection.createAnswer).not.toHaveBeenCalled();
    });

    it('does not crash when handling an offer fails', async () => {
      mockPeerConnection.createAnswer.mockRejectedValueOnce(
        new Error('WebRTC failure'),
      );

      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'offer',
                sdp: 'bad-sdp',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test-nonce',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      const onIncoming = vi.fn();
      // Should not throw
      await broker.listen(onIncoming);
      await new Promise((r) => setTimeout(r, 100));

      expect(onIncoming).not.toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('cleans up both signalers', async () => {
      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      await broker.destroy();

      expect(mockNostrSignaler.destroy).toHaveBeenCalled();
      expect(mockLibP2PSignaler.destroy).toHaveBeenCalled();
    });

    it('closes peer connection if one was established', async () => {
      mockNostrSignaler.subscribe.mockImplementation(
        async (_pubKey: string, onMessage: (msg: SignalingMessage) => void) => {
          setTimeout(() => {
            onMessage({
              kind: 'sdp',
              payload: {
                type: 'answer',
                sdp: 'v=0\r\nanswer-sdp',
                senderPubKey: mockUri.publicKey,
                recipientPubKey: mockKeypair.publicKeyHex,
                nonce: 'test',
                timestamp: Date.now(),
              },
            });
          }, 10);
          return () => {};
        },
      );

      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
        timeout: 5000,
      });

      await broker.connect(mockUri);
      await broker.destroy();

      expect(mockPeerConnection.close).toHaveBeenCalled();
    });

    it('works when no peer connection was established', async () => {
      const { SovereignBroker } = await import('../src/broker.js');
      const broker = new SovereignBroker({
        keypair: mockKeypair,
        nostrRelays: ['wss://relay.test'],
      });

      await expect(broker.destroy()).resolves.toBeUndefined();
    });
  });
});
