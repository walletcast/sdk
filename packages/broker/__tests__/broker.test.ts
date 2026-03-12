import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  DataChannelHandle,
  SignalingMessage,
  WalletCastURI,
  KeyPair,
} from '@walletcast/types';
import { WalletCastErrorCode } from '@walletcast/types';

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

  it('connect() publishes offer and waits for answer', async () => {
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

  it('connect() times out if no answer received', async () => {
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

  it('listen() subscribes and handles incoming offers', async () => {
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

  it('destroy() cleans up all resources', async () => {
    const { SovereignBroker } = await import('../src/broker.js');
    const broker = new SovereignBroker({
      keypair: mockKeypair,
      nostrRelays: ['wss://relay.test'],
    });

    await broker.destroy();

    expect(mockNostrSignaler.destroy).toHaveBeenCalled();
    expect(mockLibP2PSignaler.destroy).toHaveBeenCalled();
  });

  it('listen() ignores non-offer messages', async () => {
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
});
