import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  createSignalingEvent,
  parseSignalingEvent,
  SIGNALING_EVENT_KIND,
  getNostrPubKeyHex,
} from '../src/events.js';
import type { SignalingMessage } from '@walletcast/types';

/**
 * Generate a random keypair for testing.
 */
function generateTestKeypair() {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKeyCompressed = secp256k1.getPublicKey(privateKey, true);
  const publicKeyHex = Array.from(publicKeyCompressed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const xOnlyHex = publicKeyHex.slice(2); // drop 02/03 prefix
  return { privateKey, publicKeyCompressed, publicKeyHex, xOnlyHex };
}

describe('events', () => {
  describe('getNostrPubKeyHex', () => {
    it('should return x-only (32-byte) hex pubkey from private key', () => {
      const { privateKey, xOnlyHex } = generateTestKeypair();
      const result = getNostrPubKeyHex(privateKey);
      expect(result).toBe(xOnlyHex);
      expect(result.length).toBe(64);
    });
  });

  describe('createSignalingEvent', () => {
    it('should create a valid Nostr event with correct kind', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'v=0\r\no=- 123 1 IN IP4 0.0.0.0\r\n...',
          senderPubKey: sender.xOnlyHex,
          recipientPubKey: recipient.xOnlyHex,
          nonce: 'test-nonce-123',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      expect(event.kind).toBe(SIGNALING_EVENT_KIND);
      expect(event.pubkey).toBe(sender.xOnlyHex);
      expect(event.tags).toEqual([['p', recipient.xOnlyHex]]);
      expect(event.content).toBeTruthy();
      expect(event.id).toBeTruthy();
      expect(event.sig).toBeTruthy();
    });

    it('should accept both x-only and compressed recipient pubkeys', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const message: SignalingMessage = {
        kind: 'ice',
        payload: {
          candidate: 'candidate:1 1 udp 2122260223 192.168.1.1 12345 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
          senderPubKey: sender.xOnlyHex,
        },
      };

      // With x-only (64 char) key
      const event1 = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );
      expect(event1.tags[0][1]).toBe(recipient.xOnlyHex);

      // With compressed (66 char) key
      const event2 = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.publicKeyHex,
      );
      expect(event2.tags[0][1]).toBe(recipient.xOnlyHex);
    });
  });

  describe('parseSignalingEvent', () => {
    it('should decrypt an event created by createSignalingEvent', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const originalMessage: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'answer',
          sdp: 'v=0\r\no=- 456 1 IN IP4 0.0.0.0\r\n...',
          senderPubKey: sender.xOnlyHex,
          recipientPubKey: recipient.xOnlyHex,
          nonce: 'another-nonce',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        originalMessage,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      const parsed = await parseSignalingEvent(event, recipient.privateKey);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual(originalMessage);
    });

    it('should roundtrip ICE candidate messages', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const originalMessage: SignalingMessage = {
        kind: 'ice',
        payload: {
          candidate:
            'candidate:842163049 1 udp 1677729535 192.168.0.1 3478 typ srflx',
          sdpMid: 'audio',
          sdpMLineIndex: 0,
          senderPubKey: sender.xOnlyHex,
        },
      };

      const event = await createSignalingEvent(
        originalMessage,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      const parsed = await parseSignalingEvent(event, recipient.privateKey);
      expect(parsed).toEqual(originalMessage);
    });

    it('should return null for events with wrong kind', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test',
          senderPubKey: sender.xOnlyHex,
          recipientPubKey: recipient.xOnlyHex,
          nonce: 'n',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      // Tamper with the kind
      const tamperedEvent = { ...event, kind: 1 };
      const parsed = await parseSignalingEvent(
        tamperedEvent,
        recipient.privateKey,
      );
      expect(parsed).toBeNull();
    });

    it('should return null when decrypting with wrong key', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();
      const wrongRecipient = generateTestKeypair();

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'test',
          senderPubKey: sender.xOnlyHex,
          recipientPubKey: recipient.xOnlyHex,
          nonce: 'n',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      const parsed = await parseSignalingEvent(
        event,
        wrongRecipient.privateKey,
      );
      expect(parsed).toBeNull();
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should handle large SDP payloads', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      // Simulate a realistic SDP body
      const largeSdp = 'v=0\r\n' + 'a=candidate:fake '.repeat(500);

      const message: SignalingMessage = {
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: largeSdp,
          senderPubKey: sender.xOnlyHex,
          recipientPubKey: recipient.xOnlyHex,
          nonce: 'big-sdp-nonce',
          timestamp: Date.now(),
        },
      };

      const event = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      const parsed = await parseSignalingEvent(event, recipient.privateKey);
      expect(parsed).toEqual(message);
    });

    it('should handle null sdpMid and sdpMLineIndex in ICE', async () => {
      const sender = generateTestKeypair();
      const recipient = generateTestKeypair();

      const message: SignalingMessage = {
        kind: 'ice',
        payload: {
          candidate: 'candidate:0 1 udp 2122252543 ::1 54321 typ host',
          sdpMid: null,
          sdpMLineIndex: null,
          senderPubKey: sender.xOnlyHex,
        },
      };

      const event = await createSignalingEvent(
        message,
        sender.privateKey,
        recipient.xOnlyHex,
      );

      const parsed = await parseSignalingEvent(event, recipient.privateKey);
      expect(parsed).toEqual(message);
    });
  });
});
