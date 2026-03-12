import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataChannelWrapper } from '../src/data-channel.js';

/** Minimal mock that mirrors the RTCDataChannel interface surface we use */
function createMockDataChannel(
  overrides?: Partial<RTCDataChannel>,
): RTCDataChannel {
  const mock: Record<string, unknown> = {
    binaryType: 'blob',
    readyState: 'open',
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onclose: null as (() => void) | null,
    send: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return mock as unknown as RTCDataChannel;
}

describe('DataChannelWrapper', () => {
  let mockDC: RTCDataChannel;
  let wrapper: DataChannelWrapper;

  beforeEach(() => {
    mockDC = createMockDataChannel();
    wrapper = new DataChannelWrapper(mockDC);
  });

  it('should set binaryType to arraybuffer on construction', () => {
    expect(mockDC.binaryType).toBe('arraybuffer');
  });

  describe('send', () => {
    it('should send data through the underlying data channel as ArrayBuffer', () => {
      const data = new Uint8Array([1, 2, 3]);
      wrapper.send(data);

      expect(mockDC.send).toHaveBeenCalledTimes(1);
      // The wrapper copies into a fresh ArrayBuffer for TS 5.9 compatibility
      const sentArg = (mockDC.send as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ArrayBuffer;
      expect(sentArg).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(sentArg)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should correctly handle sub-array views', () => {
      const full = new Uint8Array([0, 1, 2, 3, 4]);
      const sub = full.subarray(1, 4); // [1, 2, 3]
      wrapper.send(sub);

      expect(mockDC.send).toHaveBeenCalledTimes(1);
      const sentArg = (mockDC.send as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ArrayBuffer;
      expect(new Uint8Array(sentArg)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('onMessage', () => {
    it('should call registered handler when a message arrives', () => {
      const handler = vi.fn();
      wrapper.onMessage(handler);

      // Simulate receiving a message through the underlying channel
      const arrayBuffer = new Uint8Array([10, 20, 30]).buffer;
      (mockDC.onmessage as (ev: MessageEvent) => void)({
        data: arrayBuffer,
      } as MessageEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(new Uint8Array([10, 20, 30]));
    });

    it('should call multiple registered handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      wrapper.onMessage(handler1);
      wrapper.onMessage(handler2);

      const arrayBuffer = new Uint8Array([5]).buffer;
      (mockDC.onmessage as (ev: MessageEvent) => void)({
        data: arrayBuffer,
      } as MessageEvent);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('onClose', () => {
    it('should call registered handler when the channel closes', () => {
      const handler = vi.fn();
      wrapper.onClose(handler);

      // Simulate close
      (mockDC.onclose as () => void)();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call multiple registered close handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      wrapper.onClose(handler1);
      wrapper.onClose(handler2);

      (mockDC.onclose as () => void)();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('should delegate to the underlying data channel', () => {
      wrapper.close();
      expect(mockDC.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('readyState', () => {
    it('should return the underlying readyState', () => {
      expect(wrapper.readyState).toBe('open');
    });

    it('should reflect changes to the underlying readyState', () => {
      (mockDC as Record<string, unknown>).readyState = 'closed';
      expect(wrapper.readyState).toBe('closed');
    });

    it('should reflect connecting state', () => {
      (mockDC as Record<string, unknown>).readyState = 'connecting';
      expect(wrapper.readyState).toBe('connecting');
    });

    it('should reflect closing state', () => {
      (mockDC as Record<string, unknown>).readyState = 'closing';
      expect(wrapper.readyState).toBe('closing');
    });
  });
});
