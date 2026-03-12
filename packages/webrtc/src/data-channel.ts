import type { DataChannelHandle } from '@walletcast/types';

export class DataChannelWrapper implements DataChannelHandle {
  private messageHandlers: Array<(data: Uint8Array) => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(private dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onmessage = (evt) => {
      const data = new Uint8Array(evt.data as ArrayBuffer);
      this.messageHandlers.forEach((h) => h(data));
    };
    dc.onclose = () => {
      this.closeHandlers.forEach((h) => h());
    };
  }

  send(data: Uint8Array): void {
    // Copy into a fresh ArrayBuffer to satisfy TS 5.9 stricter typing
    // on RTCDataChannel.send (which expects ArrayBuffer, not ArrayBufferLike)
    const buf = new ArrayBuffer(data.byteLength);
    new Uint8Array(buf).set(data);
    this.dc.send(buf);
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  close(): void {
    this.dc.close();
  }

  get readyState(): DataChannelHandle['readyState'] {
    return this.dc.readyState as DataChannelHandle['readyState'];
  }
}
