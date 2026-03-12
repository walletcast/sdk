import { SimplePool } from 'nostr-tools/pool';
import type { SubCloser } from 'nostr-tools/pool';
import type { Event as NostrEvent } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';

export type { NostrEvent, Filter as NostrFilter };

export type NostrEventCallback = (event: NostrEvent) => void;

/**
 * Lightweight relay pool manager wrapping nostr-tools SimplePool.
 * Manages WebSocket connections to multiple Nostr relays and provides
 * publish/subscribe operations.
 */
export class RelayPool {
  private pool: SimplePool;
  private relayUrls: string[] = [];
  private subscriptions: SubCloser[] = [];

  constructor() {
    this.pool = new SimplePool();
  }

  /**
   * Store relay URLs to use for publishing and subscribing.
   * SimplePool manages connections lazily, so we just record the URLs.
   */
  connect(relayUrls: string[]): void {
    this.relayUrls = [...relayUrls];
  }

  /**
   * Publish a signed Nostr event to all connected relays.
   */
  async publish(event: NostrEvent): Promise<void> {
    if (this.relayUrls.length === 0) {
      throw new Error('No relays configured. Call connect() first.');
    }
    await Promise.allSettled(
      this.pool.publish(this.relayUrls, event),
    );
  }

  /**
   * Subscribe to events matching a filter on all connected relays.
   * Returns an unsubscribe function.
   */
  subscribe(
    filter: Filter,
    onEvent: NostrEventCallback,
  ): () => void {
    if (this.relayUrls.length === 0) {
      throw new Error('No relays configured. Call connect() first.');
    }

    const sub = this.pool.subscribeMany(
      this.relayUrls,
      filter,
      {
        onevent: onEvent,
      },
    );

    this.subscriptions.push(sub);

    return () => {
      sub.close();
      const idx = this.subscriptions.indexOf(sub);
      if (idx !== -1) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }

  /**
   * Close all subscriptions and the underlying pool.
   */
  close(): void {
    for (const sub of this.subscriptions) {
      sub.close();
    }
    this.subscriptions = [];
    this.pool.close(this.relayUrls);
  }
}
