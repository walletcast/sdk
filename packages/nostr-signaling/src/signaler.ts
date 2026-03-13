import type { ISignaler, SignalingMessage, KeyPair } from '@walletcast/types';
import { RelayPool } from './relay-pool.js';
import {
  createSignalingEvent,
  parseSignalingEvent,
  SIGNALING_EVENT_KIND,
} from './events.js';

/**
 * Nostr-based signaling channel implementing the ISignaler interface.
 *
 * Uses ephemeral Nostr events (kind 21059) to exchange encrypted SDP
 * offers/answers and ICE candidates between peers. All event content
 * is end-to-end encrypted using ECDH + HKDF + AES-256-GCM.
 */
export class NostrSignaler implements ISignaler {
  private relayPool: RelayPool;
  private keypair: KeyPair;

  constructor(relayUrls: string[], keypair: KeyPair) {
    this.keypair = keypair;
    this.relayPool = new RelayPool();
    this.relayPool.connect(relayUrls);
  }

  /**
   * Publish an encrypted signaling message to the Nostr relay network.
   *
   * The message is encrypted for the recipient specified in the message
   * payload (via senderPubKey/recipientPubKey fields in SDP, or
   * senderPubKey in ICE), signed with the sender's private key, and
   * published to all configured relays.
   */
  async publish(message: SignalingMessage): Promise<void> {
    const recipientPubKey = this.getRecipientPubKey(message);

    const event = await createSignalingEvent(
      message,
      this.keypair.privateKey,
      recipientPubKey,
    );

    await this.relayPool.publish(event);
  }

  /**
   * Subscribe to signaling messages addressed to a specific public key.
   *
   * Listens for Nostr events of kind 21059 tagged with the recipient's
   * public key, decrypts them, and delivers them via the callback.
   * Uses a `since` filter of ~30 seconds to avoid stale events.
   *
   * @param recipientPubKey Hex-encoded x-only public key to listen for
   * @param onMessage Callback invoked with each decrypted SignalingMessage
   * @returns An unsubscribe function to stop listening
   */
  async subscribe(
    recipientPubKey: string,
    onMessage: (msg: SignalingMessage) => void,
  ): Promise<() => void> {
    const since = Math.floor(Date.now() / 1000) - 30;

    const unsubscribe = this.relayPool.subscribe(
      {
        kinds: [SIGNALING_EVENT_KIND],
        '#p': [recipientPubKey],
        since,
      },
      async (event) => {
        const message = await parseSignalingEvent(
          event,
          this.keypair.privateKey,
        );
        if (message) {
          onMessage(message);
        }
      },
    );

    return unsubscribe;
  }

  /**
   * Close all relay connections and clean up resources.
   */
  async destroy(): Promise<void> {
    this.relayPool.close();
  }

  /**
   * Extract the recipient public key from a signaling message.
   */
  private getRecipientPubKey(message: SignalingMessage): string {
    if (message.kind === 'sdp' || message.kind === 'relay') {
      return message.payload.recipientPubKey;
    }
    return message.payload.senderPubKey;
  }
}
