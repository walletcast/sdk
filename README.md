<p align="center">
  <img src="https://walletcast.net/assets/logo.png" width="64" alt="WalletCast logo" />
</p>

<p align="center">
  <a href="https://github.com/walletcast/sdk/actions/workflows/ci.yml"><img src="https://github.com/walletcast/sdk/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@walletcast/sdk"><img src="https://img.shields.io/npm/v/@walletcast/sdk?color=blue" alt="npm"></a>
  <a href="https://github.com/walletcast/sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT"></a>
</p>

# WalletCast

**Like WalletConnect, but without WalletConnect.**

WalletCast is a TypeScript SDK for decentralized wallet-to-dapp communication. It provides end-to-end encrypted connections between wallets and dapps without requiring WalletConnect Cloud accounts, project IDs, or any centralized relay infrastructure.

## Why WalletCast

- **No project IDs or signups** — works out of the box
- **No centralized relays** — uses Nostr relays as a decentralized message bus
- **End-to-end encrypted** — ECDH key exchange + AES-256-GCM
- **Works with existing wallets** — MetaMask, Trust Wallet, Coinbase Wallet, Phantom, OKX
- **EIP-1193 compatible** — drop-in replacement for `window.ethereum`
- **Zero backend** — no server required, pure client-side
- **Auto-detection** — detects injected wallets, only shows QR when needed
- **Session persistence** — reconnects silently on page reload (24h TTL)

## How It Works

```
Desktop Dapp <──encrypted Nostr──> Connector Page (in wallet browser)
                                     | window.ethereum
                                   Mobile Wallet
```

1. Dapp calls `WalletCast.connect()` which checks for injected wallets first
2. If no injected wallet, a Shadow DOM QR modal appears with wallet picker
3. User scans the QR — their wallet opens a connector page in its in-app browser
4. The connector detects `window.ethereum`, bridges all RPC calls over encrypted Nostr messages
5. Session is persisted on both sides — page reloads reconnect silently via ping/pong

## Quick Start

```bash
npm install @walletcast/sdk
```

### One-liner connection (recommended)

```typescript
import { WalletCast } from '@walletcast/sdk';

// Auto-detects injected wallet or shows QR modal
// Chain and accounts are detected from the wallet — no config needed
const { provider, accounts, chainId, type, disconnect } = await WalletCast.connect();

console.log(`Connected via ${type} on chain ${chainId}:`, accounts);

// Use as standard EIP-1193 provider
const balance = await provider.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] });

// Or wrap with ethers.js
import { BrowserProvider } from 'ethers';
const signer = await new BrowserProvider(provider).getSigner();

// Disconnect when done
await disconnect();
```

`WalletCast.connect()` handles everything:
- **Zero config** — detects chain and accounts from the wallet automatically
- **Tries session restore first** — if a previous session exists, silently reconnects via ping/pong
- **Checks for injected wallets** — `window.ethereum` + EIP-6963
- **Falls back to QR modal** — Shadow DOM modal with wallet picker + QR codes
- Returns `type: 'injected' | 'walletcast'` so you know which path was taken
- Optionally pass `rpcUrl` for faster read methods (routed to public RPC instead of wallet)

### Lower-level API

For custom UI or more control:

```typescript
import { WalletCast, WALLET_REGISTRY, toSVGDataURL } from '@walletcast/sdk';

const { provider, links, keypair, relays, approval } = WalletCast.createDeepLinkProvider({
  connectorUrl: 'https://walletcast.net/',
});

// Show your own QR code for MetaMask
const qrDataUrl = toSVGDataURL(links.metamask.universal, {
  moduleSize: 6,
  foreground: '#6366f1',
  background: '#141414',
});
document.querySelector('#qr').src = qrDataUrl;

const accounts = await approval;
```

## Packages

| Package | Description |
|---------|-------------|
| `@walletcast/sdk` | Main entry point — `connect()`, QR modal, session management |
| `@walletcast/deep-link` | Deep link provider, connector page, wallet registry, session manager |
| `@walletcast/provider` | EIP-1193 provider with RPC routing (reads -> public RPC, signing -> wallet) |
| `@walletcast/nostr-signaling` | Nostr relay pool + ECDH-encrypted signaling |
| `@walletcast/crypto` | Key generation (secp256k1 via @noble/curves) |
| `@walletcast/uri` | URI generation and parsing |
| `@walletcast/qr` | Zero-dependency QR code generator (SVG, canvas, data URL) |
| `@walletcast/types` | Shared TypeScript interfaces |

### P2P packages (experimental — not yet wired into the SDK)

The following packages implement direct browser-to-browser communication via WebRTC. They are published and tested but **not yet integrated** into `WalletCast.connect()`. The current production flow uses Nostr relays for signaling and message bridging. Direct P2P will be wired in a future release as an optional transport upgrade.

| Package | Description |
|---------|-------------|
| `@walletcast/sdk/p2p` | Future P2P exports (WebRTC, broker, signalers) |
| `@walletcast/broker` | SovereignBroker — orchestrates signaling + WebRTC |
| `@walletcast/webrtc` | WebRTC peer connection + binary message codec |
| `@walletcast/libp2p-signaling` | Rust/WASM libp2p signaler |

## Supported Wallets

| Wallet | Deep Link |
|--------|-----------|
| MetaMask | Yes |
| Trust Wallet | Yes (Android) |
| Coinbase Wallet | Yes |
| Phantom | Yes |
| OKX Wallet | Yes |

## Development

```bash
git clone https://github.com/walletcast/sdk
cd walletcast
pnpm install
pnpm build        # build all packages
pnpm test         # run all test suites
```

### Useful commands

```bash
pnpm --filter @walletcast/sdk build           # build a specific package
pnpm --filter @walletcast/sdk build:browser   # browser bundle (SDK only)
pnpm --filter @walletcast/deep-link build:connector  # self-contained connector HTML
pnpm typecheck                                 # type-check all packages
pnpm lint                                      # lint all packages
```

## Connector Page

The connector page is a self-contained HTML file (~55KB) that runs inside a wallet's in-app browser. It bridges `window.ethereum` calls over encrypted Nostr messages to the desktop dapp.

Features:
- **Session persistence** — survives page reloads, 24h TTL
- **Disconnect button** — sends disconnect message to dapp, clears session
- **Auto-detection** — EIP-6963 + `window.ethereum` with timeout fallback

- **Live:** [walletcast.net/](https://walletcast.net/)
- **Build:** `pnpm --filter @walletcast/deep-link build:connector`
- **Output:** `packages/deep-link/dist/connector.html`

You can self-host the connector page — just deploy the built HTML file to any static hosting.

## Examples

- **`apps/demo-dapp/`** — Vite-based demo with `WalletCast.connect()`
- **`examples/vanilla-connect/`** — Vanilla JS example, no build step required

## License

MIT
