import { ISignaler, SignalingMessage, WalletCastError, WalletCastErrorCode } from '@walletcast/types';

export class LibP2PSignaler implements ISignaler {
  /**
   * Check if the WASM module is available.
   * Currently always returns false (stub).
   */
  static async isAvailable(): Promise<boolean> {
    return false;
  }

  async publish(_message: SignalingMessage): Promise<void> {
    // Stub: never resolves in a race context
    // The broker uses Promise.any, so this rejection allows Nostr to win
    throw new WalletCastError(
      WalletCastErrorCode.UNSUPPORTED_METHOD,
      'libp2p signaling not yet implemented — use Nostr signaling',
    );
  }

  async subscribe(
    _recipientPubKey: string,
    _onMessage: (msg: SignalingMessage) => void,
  ): Promise<() => void> {
    // Return a no-op unsubscribe. The subscribe itself succeeds but never delivers messages.
    return () => {};
  }

  async destroy(): Promise<void> {
    // Nothing to clean up in the stub
  }
}
