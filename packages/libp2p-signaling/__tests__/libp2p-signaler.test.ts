import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LibP2PSignaler,
  setLibP2PWasm,
} from '../src/libp2p-signaler.js';
import type { WasmLibP2PNode, WasmModule } from '../src/libp2p-signaler.js';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';
import type { KeyPair, SignalingMessage } from '@walletcast/types';
import {
  generateKeyPair,
  encryptForPeer,
  decryptFromPeer,
  hexToBytes,
} from '@walletcast/crypto';

// ---------------------------------------------------------------------------
// Mock WASM node
// ---------------------------------------------------------------------------
let mockNode: {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

let mockWasm: WasmModule;

function createMockWasm(): WasmModule {
  mockNode = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    LibP2PNode: { create: vi.fn().mockResolvedValue(mockNode) },
  } as unknown as WasmModule;
}

// ---------------------------------------------------------------------------
// Reset module-level wasmModule state between tests.
//
// The wasmModule variable is module-scoped in libp2p-signaler.ts. We need to
// reset it between tests so that isAvailable() / ensureNode() behave correctly.
// We achieve this by re-importing with a fresh module in some tests. For most
// tests we just set the WASM via setLibP2PWasm(). To clear it we call
// setLibP2PWasm with a special null cast — but since setLibP2PWasm only
// accepts WasmModule, we use a separate approach: dynamically resetting.
// ---------------------------------------------------------------------------

// Helper: reset the internal wasm module state (set it to null).
// We do this by importing a fresh copy of the module.
// Since vitest caches modules, we use vi.resetModules() approach.
// But for simplicity we'll just call setLibP2PWasm to set it.
// To "unset" it, we need to re-import after resetModules.

describe('LibP2PSignaler', () => {
  let senderKeys: KeyPair;
  let recipientKeys: KeyPair;

  beforeEach(async () => {
    // Generate real key pairs for each test
    senderKeys = generateKeyPair();
    recipientKeys = generateKeyPair();
    mockWasm = createMockWasm();

    // Reset module state by re-importing
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // setLibP2PWasm / isAvailable
  // -----------------------------------------------------------------------
  describe('setLibP2PWasm() and isAvailable()', () => {
    it('isAvailable() returns false when no WASM loaded', async () => {
      // Fresh import — no WASM set yet
      const mod = await import('../src/libp2p-signaler.js');
      expect(await mod.LibP2PSignaler.isAvailable()).toBe(false);
    });

    it('setLibP2PWasm() makes isAvailable() return true', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      expect(await mod.LibP2PSignaler.isAvailable()).toBe(false);

      mod.setLibP2PWasm(mockWasm);
      expect(await mod.LibP2PSignaler.isAvailable()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // publish()
  // -----------------------------------------------------------------------
  describe('publish()', () => {
    it('throws WalletCastError with UNSUPPORTED_METHOD when no WASM loaded', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      try {
        await signaler.publish(message);
        expect.unreachable('Should have thrown');
      } catch (err) {
        // After vi.resetModules() the WalletCastError class from the dynamic
        // import is a different identity than the static one, so we check by
        // name and code rather than instanceof.
        expect((err as Error).name).toBe('WalletCastError');
        expect((err as WalletCastError).code).toBe(
          WalletCastErrorCode.UNSUPPORTED_METHOD,
        );
      }
    });

    it('encrypts message and publishes to gossipsub topic', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      await signaler.publish(message);

      expect(mockNode.publish).toHaveBeenCalledTimes(1);

      // The first argument is the topic (recipient public key)
      const [topic, data] = mockNode.publish.mock.calls[0];
      expect(typeof topic).toBe('string');
      expect(data).toBeInstanceOf(Uint8Array);
    });

    it('uses recipient public key as topic for SDP messages', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      await signaler.publish(message);

      const [topic] = mockNode.publish.mock.calls[0];
      expect(topic).toBe(recipientKeys.publicKeyHex);
    });

    it('uses senderPubKey as topic for ICE messages', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'ice',
        payload: {
          candidate: 'candidate:123',
          sdpMid: '0',
          sdpMLineIndex: 0,
          senderPubKey: recipientKeys.publicKeyHex,
        },
      };

      await signaler.publish(message);

      const [topic] = mockNode.publish.mock.calls[0];
      // For ICE messages, getRecipientPubKey returns payload.senderPubKey
      expect(topic).toBe(recipientKeys.publicKeyHex);
    });

    it('prepends sender pubkey hex to the wire payload', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      await signaler.publish(message);

      const [, data] = mockNode.publish.mock.calls[0];
      const payload = new TextDecoder().decode(data);

      // First 66 chars should be the sender public key hex
      const prefix = payload.slice(0, 66);
      expect(prefix).toBe(senderKeys.publicKeyHex);
    });

    it('wire format: first 66 chars are sender pubkey hex, rest is encrypted base64', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'test-nonce',
          timestamp: Date.now(),
        },
      };

      await signaler.publish(message);

      const [, data] = mockNode.publish.mock.calls[0];
      const payload = new TextDecoder().decode(data);

      // First 66 chars = sender pubkey hex (33 bytes compressed = 66 hex chars)
      const senderPubHex = payload.slice(0, 66);
      expect(senderPubHex).toHaveLength(66);
      expect(senderPubHex).toBe(senderKeys.publicKeyHex);

      // Remaining is encrypted base64
      const encryptedPart = payload.slice(66);
      expect(encryptedPart.length).toBeGreaterThan(0);

      // Verify it's valid base64 by decrypting it
      const decrypted = await decryptFromPeer(
        recipientKeys.privateKey,
        senderKeys.publicKey,
        encryptedPart,
      );
      const parsed = JSON.parse(decrypted);
      expect(parsed.kind).toBe('sdp');
      expect(parsed.payload.sdp).toBe('test-sdp');
    });
  });

  // -----------------------------------------------------------------------
  // subscribe()
  // -----------------------------------------------------------------------
  describe('subscribe()', () => {
    it('subscribes to the topic and returns unsubscribe function', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      const onMessage = vi.fn();
      const unsubscribe = await signaler.subscribe(
        recipientKeys.publicKeyHex,
        onMessage,
      );

      expect(mockNode.subscribe).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');

      // The topic should be the recipientPubKey
      const [topic] = mockNode.subscribe.mock.calls[0];
      expect(topic).toBe(recipientKeys.publicKeyHex);
    });

    it('unsubscribe function calls node.unsubscribe with the topic', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      const topicKey = recipientKeys.publicKeyHex;
      const unsubscribe = await signaler.subscribe(topicKey, vi.fn());

      unsubscribe();

      expect(mockNode.unsubscribe).toHaveBeenCalledWith(topicKey);
    });

    it('decrypts received messages and calls onMessage', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      const onMessage = vi.fn();
      await signaler.subscribe(recipientKeys.publicKeyHex, onMessage);

      // Grab the callback that was registered with node.subscribe
      const [, callback] = mockNode.subscribe.mock.calls[0];

      // Simulate an incoming message by encrypting a SignalingMessage
      // from senderKeys to recipientKeys
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'incoming-sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'nonce-123',
          timestamp: 1234567890,
        },
      };

      const encrypted = await encryptForPeer(
        senderKeys.privateKey,
        recipientKeys.publicKey,
        JSON.stringify(message),
      );

      const wirePayload = senderKeys.publicKeyHex + encrypted;
      const wireData = new TextEncoder().encode(wirePayload);

      await callback(wireData);

      expect(onMessage).toHaveBeenCalledTimes(1);
      const received = onMessage.mock.calls[0][0] as SignalingMessage;
      expect(received.kind).toBe('sdp');
      expect(received.payload.sdp).toBe('incoming-sdp');
    });

    it('ignores messages that fail to decrypt', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      const onMessage = vi.fn();
      await signaler.subscribe(recipientKeys.publicKeyHex, onMessage);

      const [, callback] = mockNode.subscribe.mock.calls[0];

      // Send garbage data that can't be decrypted
      const garbagePayload = 'a'.repeat(66) + 'not-valid-base64!!!';
      const garbageData = new TextEncoder().encode(garbagePayload);

      // Should not throw
      await callback(garbageData);

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('ignores messages encrypted for a different recipient', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      const onMessage = vi.fn();
      await signaler.subscribe(recipientKeys.publicKeyHex, onMessage);

      const [, callback] = mockNode.subscribe.mock.calls[0];

      // Encrypt for a different keypair, not for recipientKeys
      const otherKeys = generateKeyPair();
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'should-not-arrive',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: otherKeys.publicKeyHex,
          nonce: 'nonce',
          timestamp: Date.now(),
        },
      };

      const encrypted = await encryptForPeer(
        senderKeys.privateKey,
        otherKeys.publicKey,
        JSON.stringify(message),
      );

      const wirePayload = senderKeys.publicKeyHex + encrypted;
      const wireData = new TextEncoder().encode(wirePayload);

      await callback(wireData);

      // Decryption should fail since it was encrypted for otherKeys, not recipientKeys
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // destroy()
  // -----------------------------------------------------------------------
  describe('destroy()', () => {
    it('calls node.destroy()', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      // Trigger node creation by calling publish
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'sdp',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'nonce',
          timestamp: Date.now(),
        },
      };
      await signaler.publish(message);

      await signaler.destroy();

      expect(mockNode.destroy).toHaveBeenCalledTimes(1);
    });

    it('is a no-op if node was never created', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      const signaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      // Should not throw even if no node was ever created
      await expect(signaler.destroy()).resolves.toBeUndefined();
      expect(mockNode.destroy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end encryption roundtrip
  // -----------------------------------------------------------------------
  describe('encryption roundtrip', () => {
    it('publish + subscribe roundtrip using real crypto', async () => {
      const mod = await import('../src/libp2p-signaler.js');
      mod.setLibP2PWasm(mockWasm);

      // Sender signaler
      const senderSignaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        senderKeys,
      );

      // Recipient signaler
      const recipientSignaler = new mod.LibP2PSignaler(
        ['/dns4/bootnode/tcp/9090/ws'],
        recipientKeys,
      );

      // Recipient subscribes
      const receivedMessages: SignalingMessage[] = [];
      await recipientSignaler.subscribe(
        recipientKeys.publicKeyHex,
        (msg) => receivedMessages.push(msg),
      );

      // Sender publishes
      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'v=0\r\no=- session\r\n',
          senderPubKey: senderKeys.publicKeyHex,
          recipientPubKey: recipientKeys.publicKeyHex,
          nonce: 'roundtrip-nonce',
          timestamp: 1700000000,
        },
      };

      await senderSignaler.publish(message);

      // Grab what was published and feed it to the subscriber's callback
      const [, publishedData] = mockNode.publish.mock.calls[0];
      const [, subscriberCallback] = mockNode.subscribe.mock.calls[0];

      await subscriberCallback(publishedData);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].kind).toBe('sdp');
      expect(receivedMessages[0].payload).toEqual(message.payload);
    });
  });
});
