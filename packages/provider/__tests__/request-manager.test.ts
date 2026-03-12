import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataChannelHandle } from '@walletcast/types';
import { MessageType } from '@walletcast/types';
import { encodeEnvelope } from '@walletcast/webrtc';
import { RequestManager } from '../src/request-manager.js';

function createMockChannel(
  readyState: DataChannelHandle['readyState'] = 'open',
): DataChannelHandle & {
  _onMessage: ((data: Uint8Array) => void) | null;
  _onClose: (() => void) | null;
  _sent: Uint8Array[];
} {
  const mock: DataChannelHandle & {
    _onMessage: ((data: Uint8Array) => void) | null;
    _onClose: (() => void) | null;
    _sent: Uint8Array[];
  } = {
    readyState,
    _onMessage: null,
    _onClose: null,
    _sent: [],
    send: vi.fn((data: Uint8Array) => {
      mock._sent.push(data);
    }),
    onMessage: vi.fn((handler: (data: Uint8Array) => void) => {
      mock._onMessage = handler;
    }),
    onClose: vi.fn((handler: () => void) => {
      mock._onClose = handler;
    }),
    close: vi.fn(),
  };
  return mock;
}

function createResponseEnvelope(
  id: number,
  result: unknown,
): Uint8Array {
  const payload = new TextEncoder().encode(
    JSON.stringify({ jsonrpc: '2.0', id, result }),
  );
  return encodeEnvelope({
    type: MessageType.RPC_RESPONSE,
    id,
    payload,
  });
}

function createErrorResponseEnvelope(
  id: number,
  errorMessage: string,
): Uint8Array {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: errorMessage },
    }),
  );
  return encodeEnvelope({
    type: MessageType.RPC_RESPONSE,
    id,
    payload,
  });
}

describe('RequestManager', () => {
  let manager: RequestManager;

  beforeEach(() => {
    manager = new RequestManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('should send a request and resolve with the response', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise = manager.sendRequest('eth_sendTransaction', [
      { to: '0x123' },
    ]);

    // Simulate response from wallet (id=1 since it's the first request)
    channel._onMessage!(createResponseEnvelope(1, '0xhash'));

    const result = await promise;
    expect(result).toBe('0xhash');
  });

  it('should correlate requests and responses by id', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise1 = manager.sendRequest('personal_sign', ['0xdata', '0xaddr']);
    const promise2 = manager.sendRequest('eth_sendTransaction', [
      { to: '0x123' },
    ]);

    // Respond to second request first
    channel._onMessage!(createResponseEnvelope(2, 'tx-hash'));
    channel._onMessage!(createResponseEnvelope(1, 'sig-result'));

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe('sig-result');
    expect(result2).toBe('tx-hash');
  });

  it('should reject on error response', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise = manager.sendRequest('eth_sendTransaction', []);

    channel._onMessage!(
      createErrorResponseEnvelope(1, 'User rejected'),
    );

    await expect(promise).rejects.toThrow('User rejected');
  });

  it('should reject on timeout', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise = manager.sendRequest('eth_sendTransaction', [], 5_000);

    vi.advanceTimersByTime(5_001);

    await expect(promise).rejects.toThrow(
      'Request timeout: eth_sendTransaction',
    );

    // Ensure promise is fully settled before afterEach destroy()
    await vi.runAllTimersAsync();
  });

  it('should reject if channel is not attached', async () => {
    await expect(
      manager.sendRequest('eth_sendTransaction'),
    ).rejects.toThrow('Not connected');
  });

  it('should reject if channel readyState is not open', async () => {
    const channel = createMockChannel('closed');
    manager.attach(channel);

    await expect(
      manager.sendRequest('eth_sendTransaction'),
    ).rejects.toThrow('Not connected');
  });

  it('should reject all pending requests when channel closes', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise1 = manager.sendRequest('personal_sign', ['0xdata', '0xaddr']);
    const promise2 = manager.sendRequest('eth_sendTransaction', [
      { to: '0x456' },
    ]);

    // Simulate channel close
    channel._onClose!();

    await expect(promise1).rejects.toThrow('DataChannel closed');
    await expect(promise2).rejects.toThrow('DataChannel closed');
  });

  it('should reject all pending requests on destroy', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise = manager.sendRequest('eth_sendTransaction', []);

    manager.destroy();

    await expect(promise).rejects.toThrow('Provider destroyed');
  });

  it('should ignore responses for unknown request ids', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    // Send a response for an id that was never requested
    channel._onMessage!(createResponseEnvelope(999, 'unexpected'));

    // No error should be thrown - just silently ignored
  });

  it('should send correctly encoded envelope on the channel', async () => {
    const channel = createMockChannel();
    manager.attach(channel);

    const promise = manager.sendRequest('eth_sendTransaction', [{ to: '0x123' }]);

    expect(channel.send).toHaveBeenCalledOnce();
    const sentData = channel._sent[0];

    // Verify it's a valid envelope: first byte is RPC_REQUEST (0x01)
    expect(sentData[0]).toBe(MessageType.RPC_REQUEST);

    // Bytes 1-4 are the uint32 id (big-endian), id=1
    const view = new DataView(sentData.buffer, sentData.byteOffset);
    expect(view.getUint32(1, false)).toBe(1);

    // Rest is the JSON-RPC payload
    const payloadBytes = sentData.slice(5);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    expect(payload.method).toBe('eth_sendTransaction');
    expect(payload.params).toEqual([{ to: '0x123' }]);
    expect(payload.jsonrpc).toBe('2.0');
    expect(payload.id).toBe(1);

    // Resolve the pending request to avoid unhandled rejection in afterEach destroy
    channel._onMessage!(createResponseEnvelope(1, '0xhash'));
    await promise;
  });
});
