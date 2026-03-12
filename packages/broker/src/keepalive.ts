import type { DataChannelHandle } from '@walletcast/types';
import { MessageType } from '@walletcast/types';
import { encodeEnvelope, decodeEnvelope } from '@walletcast/webrtc';

export class Keepalive {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();

  constructor(
    private channel: DataChannelHandle,
    private pingIntervalMs = 15_000,
    private timeoutMs = 45_000,
  ) {}

  start(onTimeout: () => void): void {
    this.channel.onMessage((data) => {
      try {
        const envelope = decodeEnvelope(data);
        if (envelope.type === MessageType.PONG) {
          this.lastPong = Date.now();
        } else if (envelope.type === MessageType.PING) {
          const pong = encodeEnvelope({
            type: MessageType.PONG,
            id: envelope.id,
            payload: new Uint8Array(0),
          });
          this.channel.send(pong);
        }
      } catch {
        // Ignore non-keepalive messages
      }
    });

    this.interval = setInterval(() => {
      if (Date.now() - this.lastPong > this.timeoutMs) {
        this.stop();
        onTimeout();
        return;
      }
      const ping = encodeEnvelope({
        type: MessageType.PING,
        id: Math.floor(Math.random() * 0xffffffff),
        payload: new Uint8Array(0),
      });
      this.channel.send(ping);
    }, this.pingIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
