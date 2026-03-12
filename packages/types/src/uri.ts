export interface WalletCastURI {
  version: 'v1';
  publicKey: string; // hex-encoded compressed secp256k1 pubkey
  relayUrls: string[]; // Nostr relay WebSocket URLs
  bootnodes: string[]; // libp2p multiaddrs
  raw: string; // original URI string
}

export const URI_SCHEME = 'walletcast';
export const URI_VERSION = 'v1';
