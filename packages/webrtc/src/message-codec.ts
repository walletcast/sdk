import type { MessageEnvelope, MessageType } from '@walletcast/types';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';

// Binary format: [type: 1 byte][id: 4 bytes big-endian][payload: rest]

export function encodeEnvelope(envelope: MessageEnvelope): Uint8Array {
  const result = new Uint8Array(5 + envelope.payload.length);
  result[0] = envelope.type;
  new DataView(result.buffer).setUint32(1, envelope.id, false); // big-endian
  result.set(envelope.payload, 5);
  return result;
}

export function decodeEnvelope(data: Uint8Array): MessageEnvelope {
  if (data.length < 5) {
    throw new WalletCastError(
      WalletCastErrorCode.WEBRTC_FAILED,
      'Invalid envelope: too short',
    );
  }
  const type = data[0] as MessageType;
  const id = new DataView(data.buffer, data.byteOffset).getUint32(1, false);
  const payload = data.slice(5);
  return { type, id, payload };
}
