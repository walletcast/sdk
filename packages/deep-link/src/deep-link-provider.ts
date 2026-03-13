import type { EIP1193Provider } from '@walletcast/types';
import { isReadMethod, isSigningMethod, WalletCastErrorCode } from '@walletcast/types';
import { RpcRouter, ProviderEventEmitter, ProviderRpcError } from '@walletcast/provider';
import type { NostrRpcMessage } from './types.js';
import type { NostrRpc } from './nostr-rpc.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RestoredSessionState {
  remotePubKey: string;
  accounts: string[];
  chainId: string;
}

/**
 * EIP-1193 provider that communicates with a wallet via encrypted Nostr messages.
 *
 * Read methods (eth_call, eth_getBalance, etc.) go to a public RPC endpoint.
 * Signing methods (eth_sendTransaction, personal_sign, etc.) are forwarded to
 * the wallet's connector page over Nostr relays.
 */
export class DeepLinkProvider implements EIP1193Provider {
  private nostrRpc: NostrRpc;
  private rpcRouter: RpcRouter;
  private emitter = new ProviderEventEmitter();
  private remotePubKey: string | null = null;
  private accounts: string[] = [];
  private chainId: string;
  private connected = false;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private unsubscribe: (() => void) | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;

  private sessionResolve: ((accounts: string[]) => void) | null = null;
  private sessionReject: ((err: Error) => void) | null = null;

  /** Called when the remote side sends a disconnect message. */
  onSessionCleared: (() => void) | null = null;

  constructor(
    rpcUrl: string,
    chainId: number,
    nostrRpc: NostrRpc,
    restoredState?: RestoredSessionState,
  ) {
    this.chainId = `0x${chainId.toString(16)}`;
    this.rpcRouter = new RpcRouter(rpcUrl);
    this.nostrRpc = nostrRpc;

    if (restoredState) {
      this.remotePubKey = restoredState.remotePubKey;
      this.accounts = restoredState.accounts;
      this.chainId = restoredState.chainId;
      // connected stays false until ping/pong confirms
    }
  }

  /**
   * Start listening for the connector's session message.
   * Returns a promise that resolves with accounts when the wallet connects.
   */
  async waitForSession(timeout = 120_000): Promise<string[]> {
    // Subscribe to incoming Nostr messages
    this.unsubscribe = await this.nostrRpc.subscribe(
      (msg: NostrRpcMessage, senderPubKey: string) => {
        this.handleMessage(msg, senderPubKey);
      },
    );

    return new Promise<string[]>((resolve, reject) => {
      this.sessionResolve = resolve;
      this.sessionReject = reject;

      setTimeout(() => {
        if (!this.connected && this.sessionReject) {
          this.sessionReject(new Error('Deep link connection timeout'));
          this.sessionResolve = null;
          this.sessionReject = null;
        }
      }, timeout);
    });
  }

  /**
   * Attempt to restore a previous session by sending ping and waiting for pong.
   * Requires constructor to have been called with restoredState.
   * Throws if no pong received within timeout.
   */
  async restoreSession(timeout = 5000): Promise<string[]> {
    if (!this.remotePubKey || this.accounts.length === 0) {
      throw new Error('No restored state to resume');
    }

    // Subscribe to incoming messages
    this.unsubscribe = await this.nostrRpc.subscribe(
      (msg: NostrRpcMessage, senderPubKey: string) => {
        this.handleMessage(msg, senderPubKey);
      },
    );

    // Send ping to the saved remote pubkey
    await this.nostrRpc.send(this.remotePubKey, { type: 'ping' });

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Session restore timeout'));
        }
      }, timeout);

      // Listen for pong — handleMessage will set connected + lastPong
      const check = setInterval(() => {
        if (this.lastPong > 0) {
          clearInterval(check);
          clearTimeout(timer);
          this.connected = true;
          this.startHeartbeat();
          this.emitter.emit('connect', { chainId: this.chainId });
          this.emitter.emit('accountsChanged', this.accounts);
          resolve(this.accounts);
        }
      }, 100);

      // Clean up interval on timeout
      setTimeout(() => clearInterval(check), timeout + 100);
    });
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const { method, params } = args;

    switch (method) {
      case 'eth_chainId':
        return this.chainId;
      case 'eth_accounts':
        return this.accounts;
      case 'eth_requestAccounts':
        if (this.connected && this.accounts.length > 0) return this.accounts;
        throw new ProviderRpcError(
          WalletCastErrorCode.DISCONNECTED,
          'Not connected to wallet.',
        );
    }

    if (isReadMethod(method)) {
      return this.rpcRouter.sendToPublicRPC(method, params);
    }

    if (isSigningMethod(method)) {
      return this.sendToWallet(method, params);
    }

    // Unknown methods fall back to public RPC
    return this.rpcRouter.sendToPublicRPC(method, params);
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.removeListener(event, listener);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.rejectAllPending('Disconnected');
    this.connected = false;
    this.accounts = [];
    this.remotePubKey = null;
    await this.nostrRpc.destroy();
    this.emitter.emit(
      'disconnect',
      new ProviderRpcError(WalletCastErrorCode.DISCONNECTED, 'Disconnected'),
    );
  }

  private handleMessage(msg: NostrRpcMessage, senderPubKey: string): void {
    switch (msg.type) {
      case 'session':
        this.remotePubKey = senderPubKey;
        this.accounts = msg.accounts;
        if (msg.chainId) this.chainId = msg.chainId;
        this.connected = true;
        this.lastPong = Date.now();
        this.startHeartbeat();
        this.emitter.emit('connect', { chainId: this.chainId });
        this.emitter.emit('accountsChanged', this.accounts);
        if (this.sessionResolve) {
          this.sessionResolve(this.accounts);
          this.sessionResolve = null;
          this.sessionReject = null;
        }
        break;

      case 'response': {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(
            new ProviderRpcError(msg.error.code, msg.error.message),
          );
        } else {
          pending.resolve(msg.result);
        }
        break;
      }

      case 'event':
        this.emitter.emit(msg.name, msg.data);
        if (msg.name === 'accountsChanged' && Array.isArray(msg.data)) {
          this.accounts = msg.data as string[];
        }
        if (msg.name === 'chainChanged' && typeof msg.data === 'string') {
          this.chainId = msg.data;
        }
        break;

      case 'pong':
        this.lastPong = Date.now();
        break;

      case 'disconnect':
        this.connected = false;
        this.stopHeartbeat();
        this.rejectAllPending('Remote disconnected');
        this.emitter.emit(
          'disconnect',
          new ProviderRpcError(WalletCastErrorCode.DISCONNECTED, 'Remote disconnected'),
        );
        this.onSessionCleared?.();
        break;

      default:
        break;
    }
  }

  private async sendToWallet(
    method: string,
    params?: unknown[],
  ): Promise<unknown> {
    if (!this.connected || !this.remotePubKey) {
      throw new ProviderRpcError(
        WalletCastErrorCode.DISCONNECTED,
        'Not connected to wallet',
      );
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 60_000);

      this.pending.set(id, { resolve, reject, timer });

      const message: NostrRpcMessage = {
        type: 'request',
        id,
        method,
        params: params ?? [],
      };

      this.nostrRpc.send(this.remotePubKey!, message).catch((err: Error) => {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.connected || !this.remotePubKey) return;

      // Check for stale connection (no pong in 45s)
      if (Date.now() - this.lastPong > 45_000) {
        this.connected = false;
        this.emitter.emit(
          'disconnect',
          new ProviderRpcError(
            WalletCastErrorCode.DISCONNECTED,
            'Heartbeat timeout',
          ),
        );
        this.stopHeartbeat();
        return;
      }

      this.nostrRpc
        .send(this.remotePubKey!, { type: 'ping' })
        .catch(() => {});
    }, 15_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
