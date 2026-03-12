import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataChannelHandle } from '@walletcast/types';
import { MessageType } from '@walletcast/types';
import { Keepalive } from '../src/keepalive.js';
import { encodeEnvelope } from '@walletcast/webrtc';

const createMockChannel = (): DataChannelHandle & {
  triggerMessage: (data: Uint8Array) => void;
} => {
  const messageHandlers: Array<(data: Uint8Array) => void> = [];
  return {
    send: vi.fn(),
    onMessage: vi.fn((handler) => messageHandlers.push(handler)),
    onClose: vi.fn(),
    close: vi.fn(),
    readyState: 'open' as const,
    triggerMessage: (data: Uint8Array) => {
      messageHandlers.forEach((h) => h(data));
    },
  };
};

describe('Keepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ping messages at the configured interval', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 1000, 3000);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    // No pings sent immediately
    expect(channel.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(channel.send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(channel.send).toHaveBeenCalledTimes(2);

    keepalive.stop();
  });

  it('responds to ping with pong', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 5000, 15000);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    const pingData = encodeEnvelope({
      type: MessageType.PING,
      id: 42,
      payload: new Uint8Array(0),
    });

    channel.triggerMessage(pingData);

    expect(channel.send).toHaveBeenCalledTimes(1);
    keepalive.stop();
  });

  it('tracks received pongs and prevents timeout', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 100, 250);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    // Advance partway and send a pong to reset the timer
    vi.advanceTimersByTime(200);

    const pongData = encodeEnvelope({
      type: MessageType.PONG,
      id: 1,
      payload: new Uint8Array(0),
    });
    channel.triggerMessage(pongData);

    // Advance more — should not time out since we received a pong
    vi.advanceTimersByTime(200);
    expect(onTimeout).not.toHaveBeenCalled();

    keepalive.stop();
  });

  it('calls onTimeout when no pong received within timeout', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 100, 250);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    vi.advanceTimersByTime(350);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stops sending pings after timeout fires', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 100, 250);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    // Advance until timeout triggers
    vi.advanceTimersByTime(400);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    const callCount = (channel.send as ReturnType<typeof vi.fn>).mock.calls
      .length;

    // Advance more — no additional pings
    vi.advanceTimersByTime(500);
    expect(channel.send).toHaveBeenCalledTimes(callCount);
  });

  it('stop() prevents further pings', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 100, 1000);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);
    keepalive.stop();

    vi.advanceTimersByTime(500);

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('stop() can be called multiple times without error', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel, 1000, 5000);
    keepalive.start(vi.fn());

    keepalive.stop();
    keepalive.stop(); // Should not throw
  });

  it('uses default intervals when not specified', () => {
    const channel = createMockChannel();
    const keepalive = new Keepalive(channel);
    const onTimeout = vi.fn();

    keepalive.start(onTimeout);

    // Default ping interval is 15s
    vi.advanceTimersByTime(14999);
    expect(channel.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(channel.send).toHaveBeenCalledTimes(1);

    keepalive.stop();
  });
});
