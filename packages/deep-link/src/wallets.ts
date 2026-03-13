import type { WalletId, WalletInfo } from './types.js';

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export const WALLET_REGISTRY: Record<WalletId, WalletInfo> = {
  metamask: {
    name: 'MetaMask',
    universal: (url: string) => `https://metamask.app.link/dapp/${stripProtocol(url)}`,
    native: (url: string) => `metamask://dapp/${stripProtocol(url)}`,
  },
  trust: {
    name: 'Trust Wallet',
    universal: (url: string) =>
      `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
    native: (url: string) =>
      `trust://open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
  coinbase: {
    name: 'Coinbase Wallet',
    universal: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    native: (url: string) =>
      `cbwallet://dapp?url=${encodeURIComponent(url)}`,
  },
  phantom: {
    name: 'Phantom',
    universal: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}`,
    native: (url: string) =>
      `phantom://browse/${encodeURIComponent(url)}`,
  },
  okx: {
    name: 'OKX Wallet',
    universal: (url: string) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
    native: (url: string) =>
      `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
  },
};

/**
 * Build the full connector URL with connection params in the hash fragment.
 * Hash fragments are never sent to the server — safe for secrets.
 */
export function generateConnectorUrl(
  baseUrl: string,
  pubkey: string,
  relays: string[],
): string {
  const params = new URLSearchParams();
  params.set('pubkey', pubkey);
  params.set('relays', relays.join(','));
  return `${baseUrl}#${params.toString()}`;
}

/**
 * Generate deep link URLs for a specific wallet to open the connector page.
 */
export function generateDeepLink(
  walletId: WalletId,
  connectorUrl: string,
): { universal: string; native: string } {
  const wallet = WALLET_REGISTRY[walletId];
  return {
    universal: wallet.universal(connectorUrl),
    native: wallet.native(connectorUrl),
  };
}

/**
 * Generate deep links for all supported wallets.
 */
export function generateAllDeepLinks(
  connectorUrl: string,
): Record<WalletId, { universal: string; native: string }> {
  const links = {} as Record<WalletId, { universal: string; native: string }>;
  for (const id of Object.keys(WALLET_REGISTRY) as WalletId[]) {
    links[id] = generateDeepLink(id, connectorUrl);
  }
  return links;
}
