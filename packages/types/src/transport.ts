export enum MessageType {
  RPC_REQUEST = 0x01,
  RPC_RESPONSE = 0x02,
  PING = 0x03,
  PONG = 0x04,
}

export interface MessageEnvelope {
  type: MessageType;
  id: number; // uint32 request correlation ID
  payload: Uint8Array; // JSON-encoded RPC request/response
}

export interface DataChannelHandle {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  readonly readyState: 'connecting' | 'open' | 'closing' | 'closed';
}
