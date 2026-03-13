import type { KeyPair, EIP1193Provider } from '@walletcast/types';
import { generateKeyPair, pubKeyFromPrivate, hexToBytes, bytesToHex } from '@walletcast/crypto';
import {
  DeepLinkProvider,
  NostrRpc,
  SessionManager,
  generateConnectorUrl,
  generateAllDeepLinks,
  type DeepLinkConfig,
  type DeepLinkResult,
  type WalletId,
} from '@walletcast/deep-link';
import { toSVGDataURL } from '@walletcast/qr';
import type { QROptions, SVGOptions } from '@walletcast/qr';
import { QRModal } from './qr-modal.js';
import { DEFAULT_NOSTR_RELAYS } from './defaults.js';

const DEFAULT_CONNECTOR_URL = 'https://walletcast.net/';

export interface ConnectOptions {
  /** Public RPC endpoint for read methods. If omitted, all requests go through the wallet. */
  rpcUrl?: string;
  /** Target chain ID. If omitted, detected from the wallet on connect. */
  chainId?: number;
  connectorUrl?: string;
  nostrRelays?: string[];
  /** Check for injected wallet first (default: true) */
  preferInjected?: boolean;
  /** Session TTL in ms (default: 24h) */
  sessionTTL?: number;
  /** Modal theme (default: 'dark'). 'system' follows OS prefers-color-scheme. */
  theme?: 'dark' | 'light' | 'system';
  /** Pre-select a wallet (skip picker) */
  walletId?: WalletId;
}

export interface DisconnectOptions {
  /** Revoke wallet permissions so the next connect() shows the account picker (default: false). */
  revoke?: boolean;
}

export interface ConnectResult {
  provider: EIP1193Provider;
  type: 'injected' | 'walletcast';
  accounts: string[];
  chainId: string;
  disconnect: (options?: DisconnectOptions) => Promise<void>;
}

function keypairFromPrivateKeyHex(hex: string): KeyPair {
  const privateKey = hexToBytes(hex);
  const publicKey = pubKeyFromPrivate(privateKey);
  return { privateKey, publicKey, publicKeyHex: bytesToHex(publicKey) };
}

export class WalletCast {
  static generateKeyPair(): KeyPair {
    return generateKeyPair();
  }

  static toQRDataURL(data: string, options?: QROptions & SVGOptions): string {
    return toSVGDataURL(data, options);
  }

  /**
   * High-level connection API.
   *
   * 1. Try to restore a saved session (silent reconnect via ping/pong)
   * 2. If `preferInjected`, check for window.ethereum / EIP-6963
   * 3. Otherwise, show QR modal for mobile wallet connection
   */
  static async connect(options: ConnectOptions = {}): Promise<ConnectResult> {
    const sessionManager = new SessionManager(
      'walletcast_session_v1',
      options.sessionTTL ?? 24 * 60 * 60 * 1000,
    );

    // --- 1. Try session restore ---
    const saved = sessionManager.load();
    if (saved) {
      try {
        const keypair = keypairFromPrivateKeyHex(saved.privateKeyHex);
        const relays = saved.relays;
        const nostrRpc = new NostrRpc(relays, keypair);

        const provider = new DeepLinkProvider(saved.rpcUrl || undefined, saved.chainId ? parseInt(saved.chainId, 16) : undefined, nostrRpc, {
          remotePubKey: saved.remotePubKey,
          accounts: saved.accounts,
          chainId: saved.chainId,
        });

        provider.onSessionCleared = () => sessionManager.clear();

        const accounts = await provider.restoreSession(5000);

        return {
          provider,
          type: 'walletcast',
          accounts,
          chainId: saved.chainId,
          disconnect: async (_opts?: DisconnectOptions) => {
            sessionManager.clear();
            await provider.disconnect();
          },
        };
      } catch {
        // Restore failed — clear and continue
        sessionManager.clear();
      }
    }

    // --- 2. Check injected wallet ---
    if (options.preferInjected !== false) {
      const injected = await WalletCast.detectInjectedWallet();
      if (injected) {
        try {
          const accounts = (await injected.request({ method: 'eth_requestAccounts' })) as string[];
          const chainId = (await injected.request({ method: 'eth_chainId' })) as string;

          return {
            provider: injected,
            type: 'injected',
            accounts,
            chainId,
            disconnect: async (opts?: DisconnectOptions) => {
              if (opts?.revoke) {
                try {
                  // EIP-2255: revoke permissions so next connect() shows the account picker
                  await injected.request({
                    method: 'wallet_revokePermissions',
                    params: [{ eth_accounts: {} }],
                  });
                } catch {
                  // Not all wallets support wallet_revokePermissions — best effort
                }
              }
            },
          };
        } catch {
          // User rejected or provider broken — fall through to QR
        }
      }
    }

    // --- 3. Show QR modal ---
    return WalletCast.connectViaModal(options, sessionManager);
  }

  /**
   * Detect an injected EIP-1193 provider (window.ethereum or EIP-6963).
   */
  static async detectInjectedWallet(): Promise<EIP1193Provider | null> {
    const w = globalThis as unknown as {
      ethereum?: EIP1193Provider;
    };

    if (w.ethereum) return w.ethereum;

    // Try EIP-6963 with a short timeout
    return new Promise<EIP1193Provider | null>((resolve) => {
      let found = false;

      if (typeof window === 'undefined') {
        resolve(null);
        return;
      }

      window.addEventListener('eip6963:announceProvider', ((e: CustomEvent) => {
        if (!found && e.detail?.provider) {
          found = true;
          resolve(e.detail.provider as EIP1193Provider);
        }
      }) as EventListener);

      window.dispatchEvent(new Event('eip6963:requestProvider'));

      setTimeout(() => {
        if (!found) resolve(null);
      }, 500);
    });
  }

  /**
   * Create a deep-link provider that bridges to wallets via encrypted Nostr messages.
   *
   * Lower-level API — use `connect()` for the full auto-detect + QR flow.
   */
  static createDeepLinkProvider(config: DeepLinkConfig): DeepLinkResult {
    const keypair = generateKeyPair();
    const relays = config.nostrRelays ?? DEFAULT_NOSTR_RELAYS;

    const nostrRpc = new NostrRpc(relays, keypair);
    const connectorUrl = generateConnectorUrl(config.connectorUrl, nostrRpc.publicKey, relays);
    const links = generateAllDeepLinks(connectorUrl);

    const provider = new DeepLinkProvider(config.rpcUrl, config.chainId, nostrRpc);
    const approval = provider.waitForSession();

    return {
      provider,
      links,
      connectorUrl,
      pubkey: nostrRpc.publicKey,
      keypair,
      relays,
      approval,
    };
  }

  private static connectViaModal(
    options: ConnectOptions,
    sessionManager: SessionManager,
  ): Promise<ConnectResult> {
    return new Promise<ConnectResult>((resolve, reject) => {
      const config: DeepLinkConfig = {
        connectorUrl: options.connectorUrl ?? DEFAULT_CONNECTOR_URL,
        rpcUrl: options.rpcUrl,
        chainId: options.chainId,
        nostrRelays: options.nostrRelays,
      };

      const result = WalletCast.createDeepLinkProvider(config);
      const dlProvider = result.provider as unknown as DeepLinkProvider;

      const modal = new QRModal({
        theme: options.theme ?? 'dark',
        onClose: () => {
          dlProvider.disconnect().catch(() => {});
          reject(new Error('User closed modal'));
        },
      });

      modal.setLinks(result.links);

      if (options.walletId) {
        // Pre-selected wallet — go straight to QR
        modal.show();
        modal.showQR(result.links[options.walletId].universal, options.walletId);
      } else {
        modal.show();
      }

      dlProvider.onSessionCleared = () => sessionManager.clear();

      result.approval.then((accounts) => {
        // Use wallet-reported chainId (from session message), not hardcoded options
        const chainId = dlProvider.currentChainId;

        // Save session
        sessionManager.save({
          version: 1,
          privateKeyHex: bytesToHex(result.keypair.privateKey),
          publicKeyHex: result.keypair.publicKeyHex,
          remotePubKey: result.pubkey,
          relays: result.relays,
          accounts,
          chainId,
          rpcUrl: options.rpcUrl ?? '',
          connectorUrl: options.connectorUrl ?? DEFAULT_CONNECTOR_URL,
          createdAt: Date.now(),
        });

        modal.showSuccess();

        resolve({
          provider: dlProvider,
          type: 'walletcast',
          accounts,
          chainId,
          disconnect: async (_opts?: DisconnectOptions) => {
            sessionManager.clear();
            await dlProvider.disconnect();
          },
        });
      }).catch((err) => {
        modal.destroy();
        reject(err);
      });
    });
  }
}
