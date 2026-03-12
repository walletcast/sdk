import type { DataChannelHandle, MessageType, MessageEnvelope } from '@walletcast/types';
import { encodeEnvelope, decodeEnvelope } from '@walletcast/webrtc';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestManager {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private channel: DataChannelHandle | null = null;

  /** Attach to a DataChannel and listen for responses */
  attach(channel: DataChannelHandle): void {
    this.channel = channel;
    channel.onMessage((data) => {
      const envelope = decodeEnvelope(data);
      if (envelope.type === 0x02) {
        // RPC_RESPONSE
        this.handleResponse(envelope);
      }
    });
    channel.onClose(() => {
      this.rejectAll('DataChannel closed');
    });
  }

  /** Send a request and return a promise that resolves with the response */
  sendRequest(
    method: string,
    params?: unknown[],
    timeout = 30_000,
  ): Promise<unknown> {
    if (!this.channel || this.channel.readyState !== 'open') {
      return Promise.reject(new Error('Not connected'));
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });

      const payload = new TextEncoder().encode(
        JSON.stringify({ jsonrpc: '2.0', method, params: params ?? [], id }),
      );

      const envelope: MessageEnvelope = {
        type: 0x01 as MessageType, // RPC_REQUEST
        id,
        payload,
      };

      this.channel!.send(encodeEnvelope(envelope));
    });
  }

  private handleResponse(envelope: MessageEnvelope): void {
    const pending = this.pending.get(envelope.id);
    if (!pending) return;

    this.pending.delete(envelope.id);
    clearTimeout(pending.timer);

    const text = new TextDecoder().decode(envelope.payload);
    const json = JSON.parse(text) as {
      result?: unknown;
      error?: { message: string };
    };

    if (json.error) {
      pending.reject(new Error(json.error.message));
    } else {
      pending.resolve(json.result);
    }
  }

  private rejectAll(reason: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  destroy(): void {
    this.rejectAll('Provider destroyed');
    this.channel = null;
  }
}
