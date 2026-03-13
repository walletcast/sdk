import { vi } from 'vitest';
import type { EIP1193Provider } from '@walletcast/types';

// ---------- helpers ----------

function createMockProvider(): EIP1193Provider {
  return {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

// ---------- tests ----------

describe('announceProvider', () => {
  let originalWindow: typeof globalThis.window;
  let dispatchSpy: ReturnType<typeof vi.fn>;
  let addListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalWindow = globalThis.window;

    // Ensure crypto.randomUUID is available
    if (typeof globalThis.crypto === 'undefined') {
      (globalThis as any).crypto = { randomUUID: vi.fn().mockReturnValue('test-uuid-1234') };
    } else if (!globalThis.crypto.randomUUID) {
      (globalThis.crypto as any).randomUUID = vi.fn().mockReturnValue('test-uuid-1234');
    } else {
      vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('test-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);
    }

    dispatchSpy = vi.fn();
    addListenerSpy = vi.fn();

    // Set up a minimal window object
    (globalThis as any).window = {
      dispatchEvent: dispatchSpy,
      addEventListener: addListenerSpy,
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it('dispatches eip6963:announceProvider custom event', async () => {
    const { announceProvider } = await import('../src/eip6963.js');
    const provider = createMockProvider();

    announceProvider(provider);

    expect(dispatchSpy).toHaveBeenCalledOnce();
    const event = dispatchSpy.mock.calls[0][0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe('eip6963:announceProvider');
  });

  it('event detail contains correct provider info', async () => {
    const { announceProvider } = await import('../src/eip6963.js');
    const provider = createMockProvider();

    announceProvider(provider);

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    const detail = event.detail;

    expect(detail.info.rdns).toBe('com.walletcast');
    expect(detail.info.name).toBe('WalletCast');
    expect(typeof detail.info.icon).toBe('string');
    expect(detail.info.icon).toContain('data:image/svg+xml;base64,');
    expect(typeof detail.info.uuid).toBe('string');
    expect(detail.info.uuid.length).toBeGreaterThan(0);
    expect(detail.provider).toBe(provider);
  });

  it('registers a listener that responds to eip6963:requestProvider events', async () => {
    const { announceProvider } = await import('../src/eip6963.js');
    const provider = createMockProvider();

    announceProvider(provider);

    expect(addListenerSpy).toHaveBeenCalledOnce();
    expect(addListenerSpy.mock.calls[0][0]).toBe('eip6963:requestProvider');
    expect(typeof addListenerSpy.mock.calls[0][1]).toBe('function');

    // Simulate a requestProvider event by calling the registered handler
    const requestHandler = addListenerSpy.mock.calls[0][1];
    requestHandler();

    // Should have dispatched a second announceProvider event
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const secondEvent = dispatchSpy.mock.calls[1][0] as CustomEvent;
    expect(secondEvent.type).toBe('eip6963:announceProvider');
    expect(secondEvent.detail.provider).toBe(provider);
  });

  it('returns safely when window is undefined (SSR)', async () => {
    delete (globalThis as any).window;

    // Re-import to get a fresh module that sees window as undefined
    vi.resetModules();
    const { announceProvider } = await import('../src/eip6963.js');
    const provider = createMockProvider();

    // Should not throw
    expect(() => announceProvider(provider)).not.toThrow();
  });
});
