/**
 * Minimal Nostr WebSocket client.
 * No dependency on nostr-tools — raw WebSocket protocol.
 */

type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

type EventCallback = (event: NostrEvent) => void;

interface Subscription {
  id: string;
  callback: EventCallback;
}

export class NostrLitePool {
  private sockets: WebSocket[] = [];
  private relayUrls: string[] = [];
  private subscriptions = new Map<string, Subscription>();
  private subCounter = 0;
  private pendingMessages: string[][] = [];
  private readyCount = 0;

  connect(relayUrls: string[]): void {
    this.relayUrls = relayUrls;

    for (const url of relayUrls) {
      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          this.readyCount++;
          // Send any pending messages
          if (this.readyCount === 1) {
            for (const msgs of this.pendingMessages) {
              this.broadcastRaw(msgs);
            }
            this.pendingMessages = [];
          }
        };

        ws.onmessage = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data as string) as unknown[];
            if (data[0] === 'EVENT' && typeof data[1] === 'string') {
              const subId = data[1] as string;
              const event = data[2] as NostrEvent;
              const sub = this.subscriptions.get(subId);
              if (sub) {
                sub.callback(event);
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          this.readyCount = Math.max(0, this.readyCount - 1);
        };

        this.sockets.push(ws);
      } catch {
        // Skip failed connections
      }
    }
  }

  subscribe(
    filter: { kinds?: number[]; '#p'?: string[]; since?: number },
    callback: EventCallback,
  ): string {
    const subId = `wc_${this.subCounter++}`;
    this.subscriptions.set(subId, { id: subId, callback });

    const msg = JSON.stringify(['REQ', subId, filter]);
    this.broadcast(msg);

    return subId;
  }

  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId);
    const msg = JSON.stringify(['CLOSE', subId]);
    this.broadcast(msg);
  }

  publish(event: NostrEvent): void {
    const msg = JSON.stringify(['EVENT', event]);
    this.broadcast(msg);
  }

  close(): void {
    for (const ws of this.sockets) {
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
    }
    this.sockets = [];
    this.subscriptions.clear();
    this.readyCount = 0;
  }

  private broadcast(msg: string): void {
    if (this.readyCount === 0) {
      this.pendingMessages.push([msg]);
      return;
    }
    this.broadcastRaw([msg]);
  }

  private broadcastRaw(msgs: string[]): void {
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        for (const msg of msgs) {
          try {
            ws.send(msg);
          } catch {
            // Ignore send errors
          }
        }
      }
    }
  }
}
