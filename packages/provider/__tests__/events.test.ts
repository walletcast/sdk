import { vi } from 'vitest';
import { ProviderEventEmitter } from '../src/events.js';

describe('ProviderEventEmitter', () => {
  let emitter: ProviderEventEmitter;

  beforeEach(() => {
    emitter = new ProviderEventEmitter();
  });

  describe('on()', () => {
    it('registers a listener and receives emitted events', () => {
      const handler = vi.fn();
      emitter.on('accountsChanged', handler);

      emitter.emit('accountsChanged', ['0xabc']);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(['0xabc']);
    });

    it('passes multiple arguments to the listener', () => {
      const handler = vi.fn();
      emitter.on('data', handler);

      emitter.emit('data', 'a', 'b', 'c');

      expect(handler).toHaveBeenCalledWith('a', 'b', 'c');
    });
  });

  describe('multiple listeners', () => {
    it('fires all listeners registered for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      emitter.on('chainChanged', handler1);
      emitter.on('chainChanged', handler2);
      emitter.on('chainChanged', handler3);

      emitter.emit('chainChanged', '0x1');

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(handler3).toHaveBeenCalledOnce();
    });

    it('does not fire listeners for different events', () => {
      const handler = vi.fn();
      emitter.on('accountsChanged', handler);

      emitter.emit('chainChanged', '0x1');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('removeListener()', () => {
    it('removes a specific listener so it no longer receives events', () => {
      const handler = vi.fn();
      emitter.on('disconnect', handler);

      emitter.removeListener('disconnect', handler);
      emitter.emit('disconnect');

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not affect other listeners for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('disconnect', handler1);
      emitter.on('disconnect', handler2);

      emitter.removeListener('disconnect', handler1);
      emitter.emit('disconnect');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('is safe to call for an event that has no listeners', () => {
      const handler = vi.fn();
      expect(() => emitter.removeListener('noSuchEvent', handler)).not.toThrow();
    });
  });

  describe('removeAllListeners()', () => {
    it('clears all listeners for all events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('accountsChanged', handler1);
      emitter.on('chainChanged', handler2);

      emitter.removeAllListeners();

      emitter.emit('accountsChanged', ['0x123']);
      emitter.emit('chainChanged', '0x1');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('does not crash when a listener throws an error', () => {
      const throwingHandler = vi.fn().mockImplementation(() => {
        throw new Error('listener exploded');
      });
      const normalHandler = vi.fn();

      emitter.on('message', throwingHandler);
      emitter.on('message', normalHandler);

      // emit should not throw
      expect(() => emitter.emit('message', 'payload')).not.toThrow();

      // the throwing handler was called
      expect(throwingHandler).toHaveBeenCalledOnce();
      // the second handler still ran
      expect(normalHandler).toHaveBeenCalledOnce();
    });
  });

  describe('emit with no listeners', () => {
    it('does not throw when emitting an event with no listeners', () => {
      expect(() => emitter.emit('unknownEvent', 'data')).not.toThrow();
    });
  });
});
