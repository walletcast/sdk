/**
 * Generate a WalletCast URI string from its components.
 *
 * Format: walletcast:v1:<PUBKEY_HEX>?r=<RELAY_URL>&r=<RELAY_URL2>&b=<BOOTNODE>
 */
import { URI_SCHEME, URI_VERSION } from '@walletcast/types';

export interface GenerateURIOptions {
  /** Hex-encoded compressed secp256k1 public key (66 chars) */
  publicKey: string;
  /** Nostr relay WebSocket URLs */
  relayUrls?: string[];
  /** libp2p multiaddrs for bootnodes */
  bootnodes?: string[];
}

/**
 * Generate a walletcast: URI string.
 *
 * @param opts Options containing publicKey, relayUrls, and bootnodes
 * @returns Formatted walletcast: URI string
 */
export function generateURI(opts: GenerateURIOptions): string {
  const { publicKey, relayUrls = [], bootnodes = [] } = opts;

  // Build the base path
  const basePath = `${URI_SCHEME}:${URI_VERSION}:${publicKey.toLowerCase()}`;

  // Build query parameters
  const params: string[] = [];

  for (const relay of relayUrls) {
    params.push(`r=${encodeURIComponent(relay)}`);
  }

  for (const bootnode of bootnodes) {
    params.push(`b=${encodeURIComponent(bootnode)}`);
  }

  if (params.length === 0) {
    return basePath;
  }

  return `${basePath}?${params.join('&')}`;
}
