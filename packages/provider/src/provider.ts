import type {
  EIP1193Provider,
  WalletCastProviderConfig,
  DataChannelHandle,
  WalletCastURI,
} from '@walletcast/types';
import {
  isReadMethod,
  isSigningMethod,
  WalletCastErrorCode,
} from '@walletcast/types';
import { RpcRouter } from './rpc-router.js';
import { RequestManager } from './request-manager.js';
import { ProviderEventEmitter } from './events.js';
import { ProviderRpcError } from './errors.js';

export class WalletCastProvider implements EIP1193Provider {
  private rpcRouter: RpcRouter;
  private requestManager: RequestManager;
  private emitter: ProviderEventEmitter;
  private connected = false;
  private chainId: string;
  private accounts: string[] = [];
  private channel: DataChannelHandle | null = null;

  constructor(private config: WalletCastProviderConfig) {
    this.chainId = `0x${config.chainId.toString(16)}`;
    this.rpcRouter = new RpcRouter(config.rpcUrl);
    this.requestManager = new RequestManager();
    this.emitter = new ProviderEventEmitter();
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const { method, params } = args;

    // Handle special wallet methods
    switch (method) {
      case 'eth_chainId':
        return this.chainId;
      case 'eth_accounts':
        return this.accounts;
      case 'eth_requestAccounts':
        if (this.connected && this.accounts.length > 0) return this.accounts;
        throw new ProviderRpcError(
          WalletCastErrorCode.DISCONNECTED,
          'Not connected to wallet. Call connectToWallet() first.',
        );
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
        return this.sendToWallet(method, params);
    }

    // Route based on method type
    if (isReadMethod(method)) {
      return this.rpcRouter.sendToPublicRPC(method, params);
    }

    if (isSigningMethod(method)) {
      return this.sendToWallet(method, params);
    }

    // Unknown methods fall back to public RPC
    return this.rpcRouter.sendToPublicRPC(method, params);
  }

  /** Connect to a wallet via its URI */
  async connectToWallet(uri: WalletCastURI): Promise<string[]> {
    // Connect via broker
    const channel = await this.config.broker.connect(uri);
    this.channel = channel;
    this.requestManager.attach(channel);

    // Handle disconnect
    channel.onClose(() => {
      this.connected = false;
      this.accounts = [];
      this.emitter.emit(
        'disconnect',
        new ProviderRpcError(
          WalletCastErrorCode.DISCONNECTED,
          'Wallet disconnected',
        ),
      );
      this.emitter.emit('accountsChanged', []);
    });

    this.connected = true;

    // Request accounts from wallet
    const accounts = (await this.requestManager.sendRequest(
      'eth_requestAccounts',
    )) as string[];
    this.accounts = accounts;

    this.emitter.emit('connect', { chainId: this.chainId });
    this.emitter.emit('accountsChanged', accounts);

    return accounts;
  }

  /** Disconnect from the wallet */
  async disconnect(): Promise<void> {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.requestManager.destroy();
    this.connected = false;
    this.accounts = [];
    this.emitter.emit(
      'disconnect',
      new ProviderRpcError(
        WalletCastErrorCode.DISCONNECTED,
        'Disconnected',
      ),
    );
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

  private async sendToWallet(
    method: string,
    params?: unknown[],
  ): Promise<unknown> {
    if (!this.connected || !this.channel) {
      throw new ProviderRpcError(
        WalletCastErrorCode.DISCONNECTED,
        'Not connected to wallet',
      );
    }
    return this.requestManager.sendRequest(method, params);
  }
}
