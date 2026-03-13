import { finalizeEvent } from 'nostr-tools/pure';
import type { Event as NostrEvent } from 'nostr-tools/core';
import type { KeyPair } from '@walletcast/types';
import {
  RelayPool,
  SIGNALING_EVENT_KIND,
  deriveSharedKey,
  encrypt,
  decrypt,
  getNostrPubKeyHex,
} from '@walletcast/nostr-signaling';
import type { NostrRpcMessage } from './types.js';

/**
 * Encrypted Nostr RPC transport.
 *
 * Uses the same ECDH + AES-256-GCM encryption as the existing signaling
 * layer, but carries JSON-RPC messages instead of WebRTC SDP payloads.
 * Messages are published as ephemeral Nostr events (kind 21059).
 */
export class NostrRpc {
  private relayPool: RelayPool;
  private keypair: KeyPair;
  private pubKeyHex: string;

  constructor(relayUrls: string[], keypair: KeyPair) {
    this.keypair = keypair;
    this.pubKeyHex = getNostrPubKeyHex(keypair.privateKey);
    this.relayPool = new RelayPool();
    this.relayPool.connect(relayUrls);
  }

  /** Get our x-only public key hex (for sharing with the connector). */
  get publicKey(): string {
    return this.pubKeyHex;
  }

  /**
   * Send an encrypted RPC message to a recipient.
   */
  async send(recipientPubKey: string, message: NostrRpcMessage): Promise<void> {
    // Ensure compressed format (33 bytes / 66 hex) for ECDH
    const compressedPub =
      recipientPubKey.length === 64 ? '02' + recipientPubKey : recipientPubKey;

    const sharedKey = await deriveSharedKey(this.keypair.privateKey, compressedPub);
    const plaintext = JSON.stringify(message);
    const encryptedContent = await encrypt(sharedKey, plaintext);

    // Use x-only (32-byte) for the p-tag
    const recipientXOnly =
      recipientPubKey.length === 66 ? recipientPubKey.slice(2) : recipientPubKey;

    const event = finalizeEvent(
      {
        kind: SIGNALING_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientXOnly]],
        content: encryptedContent,
      },
      this.keypair.privateKey,
    );

    await this.relayPool.publish(event);
  }

  /**
   * Subscribe to encrypted RPC messages addressed to our public key.
   * Returns an unsubscribe function.
   */
  async subscribe(
    onMessage: (msg: NostrRpcMessage, senderPubKey: string) => void,
  ): Promise<() => void> {
    const since = Math.floor(Date.now() / 1000) - 30;

    const unsubscribe = this.relayPool.subscribe(
      {
        kinds: [SIGNALING_EVENT_KIND],
        '#p': [this.pubKeyHex],
        since,
      },
      async (event: NostrEvent) => {
        try {
          const senderCompressedPub = '02' + event.pubkey;
          const sharedKey = await deriveSharedKey(
            this.keypair.privateKey,
            senderCompressedPub,
          );
          const plaintext = await decrypt(sharedKey, event.content);
          const parsed = JSON.parse(plaintext) as NostrRpcMessage;

          // Validate message type
          if (parsed && typeof parsed === 'object' && 'type' in parsed) {
            onMessage(parsed, event.pubkey);
          }
        } catch {
          // Decryption or parse failure — ignore (not for us or malformed)
        }
      },
    );

    return unsubscribe;
  }

  /** Close all relay connections. */
  async destroy(): Promise<void> {
    this.relayPool.close();
  }
}
