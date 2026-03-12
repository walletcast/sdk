import type {
  EIP6963ProviderInfo,
  EIP6963ProviderDetail,
  EIP1193Provider,
} from '@walletcast/types';

const WALLETCAST_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#6366f1"/><path d="M20 32l8 8 16-16" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  );

export function announceProvider(provider: EIP1193Provider): void {
  if (typeof window === 'undefined') return;

  const info: EIP6963ProviderInfo = {
    uuid: crypto.randomUUID(),
    name: 'WalletCast',
    icon: WALLETCAST_ICON,
    rdns: 'com.walletcast',
  };

  const detail: EIP6963ProviderDetail = { info, provider };

  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', { detail }),
  );

  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', { detail }),
    );
  });
}
