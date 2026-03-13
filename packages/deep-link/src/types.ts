import type { EIP1193Provider, KeyPair } from '@walletcast/types';

export type WalletId = 'metamask' | 'trust' | 'coinbase' | 'phantom' | 'okx';

export interface WalletInfo {
  name: string;
  /** Generate universal link (https://...) for this wallet */
  universal: (connectorUrl: string) => string;
  /** Generate native deep link (protocol://...) for this wallet */
  native: (connectorUrl: string) => string;
}

export interface DeepLinkConfig {
  /** URL where the connector page is hosted */
  connectorUrl: string;
  /** Public RPC endpoint for read methods. If omitted, all requests go through the wallet. */
  rpcUrl?: string;
  /** Target chain ID. If omitted, detected from the wallet on connect. */
  chainId?: number;
  /** Nostr relay WebSocket URLs (defaults to well-known public relays) */
  nostrRelays?: string[];
  /** Fallback URL to fetch a fresh relay list if hardcoded relays are down */
  relayListUrl?: string;
}

export interface DeepLinkResult {
  /** EIP-1193 provider for the dapp to use */
  provider: EIP1193Provider;
  /** Deep link URLs per wallet */
  links: Record<WalletId, { universal: string; native: string }>;
  /** Full connector URL with connection params */
  connectorUrl: string;
  /** Dapp's public key (hex) */
  pubkey: string;
  /** Dapp's keypair (for session persistence) */
  keypair: KeyPair;
  /** Nostr relay URLs used (for session persistence) */
  relays: string[];
  /** Resolves with accounts when the wallet connects */
  approval: Promise<string[]>;
}

/** Messages exchanged over encrypted Nostr events */
export type NostrRpcMessage =
  | { type: 'session'; accounts: string[]; chainId: string }
  | { type: 'request'; id: number; method: string; params: unknown[] }
  | { type: 'response'; id: number; result?: unknown; error?: { code: number; message: string } }
  | { type: 'event'; name: string; data: unknown }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'disconnect' };
