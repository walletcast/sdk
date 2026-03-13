<p align="center">
  <img src="https://walletcast.net/assets/logo.png" width="64" alt="WalletCast logo" />
</p>

# @walletcast/sdk

**Like WalletConnect, but without WalletConnect.**

Connect any mobile wallet to any dapp — no API keys, no signups, no centralized relay. Built on encrypted Nostr messaging and open protocols.

[![npm](https://img.shields.io/npm/v/@walletcast/sdk)](https://www.npmjs.com/package/@walletcast/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/walletcast/sdk/blob/main/LICENSE)

## Install

```bash
npm install @walletcast/sdk
```

## Quick Start

```typescript
import { WalletCast } from '@walletcast/sdk';

const { provider, accounts, chainId, type, disconnect } = await WalletCast.connect();
// type is 'injected' (window.ethereum) or 'walletcast' (QR deep link)

// Use as standard EIP-1193 provider
const balance = await provider.request({
  method: 'eth_getBalance',
  params: [accounts[0], 'latest'],
});

// With ethers.js
import { BrowserProvider } from 'ethers';
const signer = await new BrowserProvider(provider).getSigner();

// Disconnect
await disconnect();
```

`WalletCast.connect()` handles everything automatically:
- Tries to restore a saved session first (24h TTL)
- Detects injected wallets (`window.ethereum`, EIP-6963)
- Falls back to a QR modal with deep links for MetaMask, Trust, Coinbase Wallet, Phantom, OKX

## API

### `WalletCast.connect(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rpcUrl` | string | — | Public RPC for read methods |
| `chainId` | number | — | Detected from wallet if omitted |
| `connectorUrl` | string | `'https://walletcast.net/'` | Connector page URL |
| `nostrRelays` | string[] | defaults | Nostr relay URLs |
| `preferInjected` | boolean | `true` | Check injected wallet first |
| `theme` | `'dark' \| 'light' \| 'system'` | `'dark'` | QR modal theme |
| `walletId` | WalletId | — | Skip picker, show specific wallet QR |

Returns `{ provider, type, accounts, chainId, disconnect }`.

### `WalletCast.createDeepLinkProvider(config)`

Lower-level API for custom UI — generates deep links without showing any modal.

```typescript
import { WalletCast, toSVGDataURL } from '@walletcast/sdk';

const { provider, links, approval } = WalletCast.createDeepLinkProvider({
  connectorUrl: 'https://walletcast.net/',
});

const qrSvg = toSVGDataURL(links.metamask.universal, { moduleSize: 6 });
const accounts = await approval;
```

### Events

```typescript
provider.on('connect', ({ chainId }) => { /* ... */ });
provider.on('disconnect', () => { /* ... */ });
provider.on('accountsChanged', (accounts) => { /* ... */ });
provider.on('chainChanged', (chainId) => { /* ... */ });
```

## Framework Examples

**ethers.js**
```typescript
const { provider } = await WalletCast.connect();
const signer = await new BrowserProvider(provider).getSigner();
```

**viem**
```typescript
const { provider } = await WalletCast.connect();
const client = createWalletClient({ chain: mainnet, transport: custom(provider) });
```

**React**
```typescript
const [result, setResult] = useState(null);
const connect = useCallback(async () => {
  const res = await WalletCast.connect();
  setResult(res);
  res.provider.on('disconnect', () => setResult(null));
}, []);
```

## Supported Wallets

MetaMask · Trust Wallet · Coinbase Wallet · Phantom · OKX Wallet

## Self-Hosting the Connector

The connector is a single self-contained HTML file (~82KB). Deploy it anywhere:

```bash
npm install @walletcast/deep-link
# builds connector.html — deploy to any static host

WalletCast.connect({ connectorUrl: 'https://your-domain.com/connector.html' });
```

## Links

- **Live connector + docs:** [walletcast.net](https://walletcast.net)
- **GitHub:** [github.com/walletcast/sdk](https://github.com/walletcast/sdk)
- **npm:** [npmjs.com/package/@walletcast/sdk](https://www.npmjs.com/package/@walletcast/sdk)

## License

MIT
