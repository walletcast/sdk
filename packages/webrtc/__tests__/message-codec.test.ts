import { describe, it, expect } from 'vitest';
import { MessageType, WalletCastError } from '@walletcast/types';
import { encodeEnvelope, decodeEnvelope } from '../src/message-codec.js';

describe('message-codec', () => {
  describe('roundtrip encode/decode', () => {
    it('should roundtrip RPC_REQUEST', () => {
      const payload = new TextEncoder().encode('{"method":"eth_accounts"}');
      const envelope = { type: MessageType.RPC_REQUEST, id: 1, payload };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.type).toBe(MessageType.RPC_REQUEST);
      expect(decoded.id).toBe(1);
      expect(decoded.payload).toEqual(payload);
    });

    it('should roundtrip RPC_RESPONSE', () => {
      const payload = new TextEncoder().encode('{"result":["0xabc"]}');
      const envelope = { type: MessageType.RPC_RESPONSE, id: 42, payload };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.type).toBe(MessageType.RPC_RESPONSE);
      expect(decoded.id).toBe(42);
      expect(decoded.payload).toEqual(payload);
    });

    it('should roundtrip PING', () => {
      const payload = new Uint8Array(0);
      const envelope = { type: MessageType.PING, id: 100, payload };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.type).toBe(MessageType.PING);
      expect(decoded.id).toBe(100);
      expect(decoded.payload.length).toBe(0);
    });

    it('should roundtrip PONG', () => {
      const payload = new Uint8Array(0);
      const envelope = { type: MessageType.PONG, id: 100, payload };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.type).toBe(MessageType.PONG);
      expect(decoded.id).toBe(100);
      expect(decoded.payload.length).toBe(0);
    });

    it('should roundtrip all MessageType values', () => {
      const types = [
        MessageType.RPC_REQUEST,
        MessageType.RPC_RESPONSE,
        MessageType.PING,
        MessageType.PONG,
      ];

      for (const type of types) {
        const payload = new TextEncoder().encode(`test-${type}`);
        const envelope = { type, id: type * 1000, payload };

        const encoded = encodeEnvelope(envelope);
        const decoded = decodeEnvelope(encoded);

        expect(decoded.type).toBe(type);
        expect(decoded.id).toBe(type * 1000);
        expect(decoded.payload).toEqual(payload);
      }
    });
  });

  describe('binary format', () => {
    it('should produce correct binary layout', () => {
      const payload = new Uint8Array([0xaa, 0xbb]);
      const envelope = {
        type: MessageType.RPC_REQUEST,
        id: 0x00000102,
        payload,
      };

      const encoded = encodeEnvelope(envelope);

      // [type: 1 byte][id: 4 bytes big-endian][payload: rest]
      expect(encoded.length).toBe(7); // 1 + 4 + 2
      expect(encoded[0]).toBe(MessageType.RPC_REQUEST); // 0x01
      // id = 0x00000102 in big-endian
      expect(encoded[1]).toBe(0x00);
      expect(encoded[2]).toBe(0x00);
      expect(encoded[3]).toBe(0x01);
      expect(encoded[4]).toBe(0x02);
      // payload
      expect(encoded[5]).toBe(0xaa);
      expect(encoded[6]).toBe(0xbb);
    });

    it('should handle max uint32 id', () => {
      const envelope = {
        type: MessageType.PING,
        id: 0xffffffff,
        payload: new Uint8Array(0),
      };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.id).toBe(0xffffffff);
    });

    it('should handle id = 0', () => {
      const envelope = {
        type: MessageType.PING,
        id: 0,
        payload: new Uint8Array(0),
      };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.id).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty payload', () => {
      const envelope = {
        type: MessageType.PING,
        id: 5,
        payload: new Uint8Array(0),
      };

      const encoded = encodeEnvelope(envelope);
      expect(encoded.length).toBe(5); // header only

      const decoded = decodeEnvelope(encoded);
      expect(decoded.payload.length).toBe(0);
    });

    it('should handle large payload', () => {
      const largePayload = new Uint8Array(64 * 1024); // 64KB
      for (let i = 0; i < largePayload.length; i++) {
        largePayload[i] = i % 256;
      }

      const envelope = {
        type: MessageType.RPC_RESPONSE,
        id: 99,
        payload: largePayload,
      };

      const encoded = encodeEnvelope(envelope);
      const decoded = decodeEnvelope(encoded);

      expect(decoded.payload.length).toBe(64 * 1024);
      expect(decoded.payload).toEqual(largePayload);
    });

    it('should throw on data shorter than 5 bytes', () => {
      expect(() => decodeEnvelope(new Uint8Array(0))).toThrow(WalletCastError);
      expect(() => decodeEnvelope(new Uint8Array(1))).toThrow(WalletCastError);
      expect(() => decodeEnvelope(new Uint8Array(4))).toThrow(WalletCastError);
    });

    it('should not throw on exactly 5 bytes (empty payload)', () => {
      const data = new Uint8Array([0x01, 0, 0, 0, 1]);
      const decoded = decodeEnvelope(data);
      expect(decoded.type).toBe(MessageType.RPC_REQUEST);
      expect(decoded.id).toBe(1);
      expect(decoded.payload.length).toBe(0);
    });

    it('should decode from a sub-array (byteOffset handling)', () => {
      // Simulate receiving data from a buffer where the envelope starts at a non-zero offset
      const buffer = new ArrayBuffer(16);
      const view = new Uint8Array(buffer);
      // Write envelope at offset 3: type=0x02, id=7, payload=[0xff]
      view[3] = 0x02; // RPC_RESPONSE
      view[4] = 0x00;
      view[5] = 0x00;
      view[6] = 0x00;
      view[7] = 0x07; // id = 7
      view[8] = 0xff; // payload

      const subArray = new Uint8Array(buffer, 3, 6);
      const decoded = decodeEnvelope(subArray);

      expect(decoded.type).toBe(MessageType.RPC_RESPONSE);
      expect(decoded.id).toBe(7);
      expect(decoded.payload).toEqual(new Uint8Array([0xff]));
    });
  });
});
