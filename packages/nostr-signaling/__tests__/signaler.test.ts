import { describe, it, expect, vi, beforeEach } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { SignalingMessage, KeyPair } from '@walletcast/types';
import { NostrSignaler } from '../src/signaler.js';
import { createSignalingEvent, SIGNALING_EVENT_KIND } from '../src/events.js';

/**
 * Generate a test KeyPair matching the @walletcast/types interface.
 */
function generateTestKeypair(): KeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const publicKeyHex = Array.from(publicKey.slice(1))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { privateKey, publicKey, publicKeyHex };
}

// --- Mock the RelayPool ---

// Each RelayPool instance will store its own mock functions here.
// We track the most recently created instance for assertions.
type EventCallback = (event: import('nostr-tools/core').Event) => void;

interface MockRelayPoolInstance {
  connect: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let latestMockPool: MockRelayPoolInstance;
const allMockPools: MockRelayPoolInstance[] = [];

vi.mock('../src/relay-pool.js', () => {
  return {
    RelayPool: vi.fn().mockImplementation(() => {
      const instance: MockRelayPoolInstance = {
        connect: vi.fn(),
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockImplementation(() => vi.fn()),
        close: vi.fn(),
      };
      latestMockPool = instance;
      allMockPools.push(instance);
      return instance;
    }),
  };
});

describe('NostrSignaler', () => {
  let senderKeypair: KeyPair;
  let recipientKeypair: KeyPair;
  let signaler: NostrSignaler;

  beforeEach(() => {
    vi.clearAllMocks();
    allMockPools.length = 0;
    senderKeypair = generateTestKeypair();
    recipientKeypair = generateTestKeypair();
    signaler = new NostrSignaler(
      ['wss://relay1.example.com', 'wss://relay2.example.com'],
      senderKeypair,
    );
  });

  describe('constructor', () => {
    it('should connect to the provided relay URLs', () => {
      expect(latestMockPool.connect).toHaveBeenCalledWith([
        'wss://relay1.example.com',
        'wss://relay2.example.com',
      ]);
    });
  });

  describe('publish', () => {
    it('should create and publish an encrypted event for SDP messages', async () => {
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'v=0\r\ntest-sdp',
          senderPubKey: senderKeypair.publicKeyHex,
          recipientPubKey: recipientKeypair.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      await signaler.publish(message);

      expect(latestMockPool.publish).toHaveBeenCalledTimes(1);

      const publishedEvent = latestMockPool.publish.mock.calls[0][0];
      expect(publishedEvent.kind).toBe(SIGNALING_EVENT_KIND);
      expect(publishedEvent.tags).toEqual([
        ['p', recipientKeypair.publicKeyHex],
      ]);
      expect(publishedEvent.content).toBeTruthy();
      expect(publishedEvent.id).toBeTruthy();
      expect(publishedEvent.sig).toBeTruthy();
    });

    it('should publish ICE candidate messages', async () => {
      const message: SignalingMessage = {
        kind: 'ice',
        payload: {
          candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 12345 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
          senderPubKey: recipientKeypair.publicKeyHex,
        },
      };

      await signaler.publish(message);
      expect(latestMockPool.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('should subscribe with correct filter parameters', async () => {
      const onMessage = vi.fn();
      const beforeTime = Math.floor(Date.now() / 1000) - 30;

      await signaler.subscribe(recipientKeypair.publicKeyHex, onMessage);

      expect(latestMockPool.subscribe).toHaveBeenCalledTimes(1);

      const filter = latestMockPool.subscribe.mock.calls[0][0];
      expect(filter.kinds).toEqual([SIGNALING_EVENT_KIND]);
      expect(filter['#p']).toEqual([recipientKeypair.publicKeyHex]);
      expect(filter.since).toBeGreaterThanOrEqual(beforeTime);
      expect(filter.since).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000) - 29,
      );
    });

    it('should return an unsubscribe function', async () => {
      const onMessage = vi.fn();
      const unsubscribe = await signaler.subscribe(
        recipientKeypair.publicKeyHex,
        onMessage,
      );
      expect(typeof unsubscribe).toBe('function');
    });

    it('should decrypt events and call onMessage with valid messages', async () => {
      const onMessage = vi.fn();

      // Create a signaler for the recipient
      const recipientSignaler = new NostrSignaler(
        ['wss://relay1.example.com'],
        recipientKeypair,
      );

      // Get the mock pool for the recipient signaler (the latest one created)
      const recipientPool = latestMockPool;

      // Override the subscribe mock to capture the event callback
      let capturedCallback: EventCallback | undefined;
      recipientPool.subscribe.mockImplementation(
        (
          _filter: unknown,
          callback: EventCallback,
        ) => {
          capturedCallback = callback;
          return vi.fn();
        },
      );

      await recipientSignaler.subscribe(
        recipientKeypair.publicKeyHex,
        onMessage,
      );

      expect(capturedCallback).toBeDefined();

      // Create a real encrypted event from sender to recipient
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'v=0\r\ntest-sdp',
          senderPubKey: senderKeypair.publicKeyHex,
          recipientPubKey: recipientKeypair.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        message,
        senderKeypair.privateKey,
        recipientKeypair.publicKeyHex,
      );

      // Simulate receiving the event
      capturedCallback!(event);

      // Wait for async decryption
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(message);

      await recipientSignaler.destroy();
    });
  });

  describe('destroy', () => {
    it('should close the relay pool', async () => {
      await signaler.destroy();
      expect(latestMockPool.close).toHaveBeenCalledTimes(1);
    });
  });
});
