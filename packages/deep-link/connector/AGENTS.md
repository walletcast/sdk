# WalletCast — Integration Guide

Use this guide to integrate `@walletcast/sdk` into any web dapp for decentralized wallet connection.

## Installation

```bash
npm install @walletcast/sdk
```

## API Reference

### `WalletCast.connect(options)` — Recommended

High-level API that handles everything: session restore, injected wallet detection, and QR modal.

```typescript
import { WalletCast } from '@walletcast/sdk';

const { provider, accounts, type, chainId, disconnect } = await WalletCast.connect({
  rpcUrl: 'https://eth.llamarpc.com',    // Public RPC for read methods
  chainId: 1,                             // Target chain ID
  connectorUrl: 'https://walletcast.net/',  // Optional (default)
  nostrRelays: ['wss://relay.damus.io'],  // Optional — defaults provided
  preferInjected: true,                    // Check injected wallets first (default)
  theme: 'dark',                           // QR modal theme (default)
});

// type is 'injected' | 'walletcast'
console.log(`Connected via ${type}:`, accounts);
```

**Returns `ConnectResult`:**
- `provider` — EIP-1193 compatible provider
- `type` — `'injected'` if an injected wallet was used, `'walletcast'` if QR/deep link was used
- `accounts` — Connected wallet accounts
- `chainId` — Hex chain ID (e.g. `"0x1"`)
- `disconnect` — `() => Promise<void>` — call to disconnect and clear session

**Behavior:**
1. Tries to restore a saved session (silent reconnect via ping/pong, 5s timeout)
2. If `preferInjected` is true, checks for `window.ethereum` + EIP-6963
3. If no injected wallet found, shows a Shadow DOM QR modal with wallet picker

### `WalletCast.createDeepLinkProvider(config)` — Lower-level

For custom UI — generates deep links but doesn't show any modal. You render your own QR.

```typescript
import { WalletCast, WALLET_REGISTRY, toSVGDataURL } from '@walletcast/sdk';

const { provider, links, connectorUrl, pubkey, keypair, relays, approval } = WalletCast.createDeepLinkProvider({
  connectorUrl: 'https://walletcast.net/',
  rpcUrl: 'https://eth.llamarpc.com',
  chainId: 1,
});
```

**Returns `DeepLinkResult`:**
- `provider` — EIP-1193 compatible provider
- `links` — `Record<WalletId, { universal: string; native: string }>` — deep link URLs for each wallet
- `connectorUrl` — Full connector URL: `https://walletcast.net/c/{pubkey_b64url}/{relay1}/{relay2}/...`
- `pubkey` — Dapp's ephemeral public key (hex)
- `keypair` — Dapp's full keypair (for manual session persistence)
- `relays` — Nostr relay URLs used
- `approval` — `Promise<string[]>` — resolves with accounts when wallet connects

### `WalletCast.detectInjectedWallet()`

Check for an injected EIP-1193 provider without triggering connection.

```typescript
const injected = await WalletCast.detectInjectedWallet();
if (injected) {
  // Use injected wallet directly
}
```

### Utility Exports

```typescript
import {
  generateKeyPair,    // Returns KeyPair { privateKey, publicKey, publicKeyHex }
  toSVGDataURL,       // Render QR code as SVG data URL
  WALLET_REGISTRY,    // Wallet metadata map
  SessionManager,     // Manual session persistence
  QRModal,            // Use the modal directly
} from '@walletcast/sdk';
```

## Common Patterns

### Simplest integration

```typescript
import { WalletCast } from '@walletcast/sdk';

const { provider, disconnect } = await WalletCast.connect({
  rpcUrl: 'https://eth.llamarpc.com',
  chainId: 1,
});

// Done! provider is ready to use.
```

### With ethers.js v6

```typescript
import { BrowserProvider } from 'ethers';
import { WalletCast } from '@walletcast/sdk';

const { provider } = await WalletCast.connect({
  rpcUrl: 'https://eth.llamarpc.com',
  chainId: 1,
});

const signer = await new BrowserProvider(provider).getSigner();
const tx = await signer.sendTransaction({ to: '0x...', value: parseEther('0.01') });
```

### With viem

```typescript
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';
import { WalletCast } from '@walletcast/sdk';

const { provider } = await WalletCast.connect({
  rpcUrl: 'https://eth.llamarpc.com',
  chainId: 1,
});

const client = createWalletClient({
  chain: mainnet,
  transport: custom(provider),
});
```

### With React

```typescript
import { useState, useCallback } from 'react';
import { WalletCast } from '@walletcast/sdk';
import type { EIP1193Provider, ConnectResult } from '@walletcast/sdk';

function useWalletCast(chainId: number, rpcUrl: string) {
  const [result, setResult] = useState<ConnectResult | null>(null);

  const connect = useCallback(async () => {
    const res = await WalletCast.connect({ rpcUrl, chainId });
    setResult(res);

    res.provider.on('disconnect', () => setResult(null));
    return res;
  }, [rpcUrl, chainId]);

  const disconnect = useCallback(async () => {
    await result?.disconnect();
    setResult(null);
  }, [result]);

  return {
    provider: result?.provider ?? null,
    accounts: result?.accounts ?? [],
    type: result?.type ?? null,
    isConnected: !!result,
    connect,
    disconnect,
  };
}
```

### Custom QR UI (skip built-in modal)

```typescript
import { WalletCast, toSVGDataURL, WALLET_REGISTRY } from '@walletcast/sdk';
import type { WalletId } from '@walletcast/sdk';

const { provider, links, approval } = WalletCast.createDeepLinkProvider({
  connectorUrl: 'https://walletcast.net/',
  rpcUrl: 'https://eth.llamarpc.com',
  chainId: 1,
});

// Render your own QR
const walletId: WalletId = 'metamask';
const qrSvg = toSVGDataURL(links[walletId].universal, {
  moduleSize: 6,
  foreground: '#6366f1',
  background: '#141414',
});
document.querySelector<HTMLImageElement>('#qr').src = qrSvg;

const accounts = await approval;
```

## Supported Wallets

| ID | Wallet | Deep Link | Universal Link |
|----|--------|-----------|----------------|
| `metamask` | MetaMask | `metamask://dapp/...` | `https://metamask.app.link/dapp/...` |
| `trust` | Trust Wallet | `trust://open_url?...` | `https://link.trustwallet.com/open_url?...` |
| `coinbase` | Coinbase Wallet | `cbwallet://dapp?...` | `https://go.cb-w.com/dapp?...` |
| `phantom` | Phantom | `phantom://browse/...` | `https://phantom.app/ul/browse/...` |
| `okx` | OKX Wallet | `okx://wallet/dapp/url?...` | — |

## EIP-1193 Events

```typescript
provider.on('connect', ({ chainId }) => { ... });
provider.on('disconnect', () => { ... });
provider.on('accountsChanged', (accounts: string[]) => { ... });
provider.on('chainChanged', (chainId: string) => { ... });
```

## Session Persistence

Sessions are automatically managed by `WalletCast.connect()`:
- Saved to `localStorage` with 24-hour TTL
- Restored silently on page reload via ping/pong
- Cleared on `disconnect()` or when connector sends disconnect message
- Works on both dapp and connector sides

## Self-Hosting the Connector

The connector page is a self-contained HTML file (~55KB). To self-host:

```bash
npm install @walletcast/deep-link
cd node_modules/@walletcast/deep-link
pnpm build:connector
```

Output: `dist/connector.html`. Deploy to any static hosting and pass your URL as `connectorUrl`.

## Source

- GitHub: [github.com/nicholasgasior/walletcast](https://github.com/nicholasgasior/walletcast)
- npm: [@walletcast/sdk](https://www.npmjs.com/package/@walletcast/sdk)
