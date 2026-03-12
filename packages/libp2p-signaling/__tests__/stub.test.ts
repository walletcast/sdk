import { describe, it, expect } from 'vitest';
import { LibP2PSignaler } from '../src/index.js';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';

describe('LibP2PSignaler (stub)', () => {
  it('isAvailable() returns false', async () => {
    expect(await LibP2PSignaler.isAvailable()).toBe(false);
  });

  it('publish() rejects with UNSUPPORTED_METHOD error', async () => {
    const signaler = new LibP2PSignaler();
    await expect(
      signaler.publish({
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'fake',
          senderPubKey: 'sender',
          recipientPubKey: 'recipient',
          nonce: 'nonce',
          timestamp: Date.now(),
        },
      }),
    ).rejects.toThrow(WalletCastError);

    try {
      await signaler.publish({
        kind: 'sdp',
        payload: {
          type: 'offer',
          sdp: 'fake',
          senderPubKey: 'sender',
          recipientPubKey: 'recipient',
          nonce: 'nonce',
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(WalletCastError);
      expect((err as WalletCastError).code).toBe(WalletCastErrorCode.UNSUPPORTED_METHOD);
    }
  });

  it('subscribe() returns a function', async () => {
    const signaler = new LibP2PSignaler();
    const unsubscribe = await signaler.subscribe('pubkey', () => {});
    expect(typeof unsubscribe).toBe('function');
    // Calling unsubscribe should not throw
    unsubscribe();
  });

  it('destroy() resolves', async () => {
    const signaler = new LibP2PSignaler();
    await expect(signaler.destroy()).resolves.toBeUndefined();
  });
});
