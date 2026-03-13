# WalletCast — Agent Development Guide

TypeScript SDK for decentralized wallet-dapp communication via encrypted Nostr messages.

## Build System

- **pnpm 9.15+** workspaces (`pnpm-workspace.yaml`: `packages/*`, `apps/*`)
- **Turbo** for task orchestration (build dependencies via `^build`)
- **tsup** for library bundling (CJS + ESM + DTS)
- **esbuild** for the connector page (`packages/deep-link/scripts/build-connector.mjs`)
- **Vitest** for tests (`vitest.workspace.ts`)
- **TypeScript 5.5** strict mode, ESM-first

## Key Commands

```bash
pnpm build                                            # Build all packages
pnpm test                                             # Run all tests
pnpm --filter @walletcast/sdk build                   # Build specific package
pnpm --filter @walletcast/sdk build:browser           # Browser bundle (SDK only)
pnpm --filter @walletcast/deep-link build:connector   # Self-contained connector HTML
pnpm typecheck                                        # Type-check all packages
pnpm lint                                             # Lint all packages
```

## Package Dependency Graph

```
@walletcast/types          (leaf -- no deps)
  |-- @walletcast/crypto
  |-- @walletcast/uri
  +-- @walletcast/qr
        |
@walletcast/nostr-signaling  (depends on types, uses @noble/curves, nostr-tools)
@walletcast/libp2p-signaling (depends on types, Rust/WASM)
        |
@walletcast/webrtc           (depends on types)
        |
@walletcast/broker           (depends on nostr-signaling, libp2p-signaling, webrtc)
        |
@walletcast/provider         (depends on types -- EIP-1193 + RPC routing)
        |
@walletcast/deep-link        (depends on provider, nostr-signaling, crypto)
        |                     contains: DeepLinkProvider, NostrRpc, SessionManager
        |                     contains: connector page source (esbuild entry)
        |
@walletcast/sdk              (facade -- connect(), QR modal, session restore)
  main export: WalletCast.connect(), createDeepLinkProvider(), QRModal
  subpath:     @walletcast/sdk/p2p -- stashed P2P exports (broker, webrtc, signalers)
```

Note: WalletConnect packages (wc-provider, wc-adapter) have been removed.
P2P exports (broker, webrtc, signalers) are available via `@walletcast/sdk/p2p` subpath.

## SDK Public API

### `WalletCast.connect(options)` — Primary entry point

Auto-detects injected wallet or shows QR modal. Restores saved sessions.

```typescript
const { provider, accounts, type, chainId, disconnect } = await WalletCast.connect({
  rpcUrl: string;           // Public RPC for read methods
  chainId: number;          // Target chain ID
  connectorUrl?: string;    // Default: machinemade.name/walletcast/
  nostrRelays?: string[];   // Override default relays
  preferInjected?: boolean; // Default: true
  theme?: 'dark' | 'light'; // Modal theme
  walletId?: WalletId;      // Skip picker, go straight to QR
});
// type: 'injected' | 'walletcast'
```

### `WalletCast.createDeepLinkProvider(config)` — Lower-level

Returns `{ provider, links, connectorUrl, pubkey, keypair, relays, approval }`.

### `WalletCast.detectInjectedWallet()` — Check for injected provider

Returns `EIP1193Provider | null`.

## Coding Conventions

- ESM-first: `"type": "module"` in all `package.json` files
- Use `.js` extensions in import paths (ESM requirement)
- Dual CJS/ESM output via tsup
- Prettier for formatting (`.prettierrc` at root)
- Test files go in `__tests__/` directory per package
- Each package has its own `vitest.config.ts`

## Architecture Patterns

### EIP-1193 Provider Interface
All providers implement `EIP1193Provider` from `packages/types/src/transport.ts`:
```typescript
interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}
```

### RPC Routing
Providers split RPC calls into two paths:
- **Read methods** (eth_call, eth_getBalance, eth_blockNumber, etc.) -> sent to public RPC URL
- **Signing methods** (eth_sendTransaction, personal_sign, eth_signTypedData_v4, etc.) -> forwarded to wallet

### Session Persistence

**Dapp side** (`SessionManager` in `packages/deep-link/src/session-manager.ts`):
- Saves keypair + wallet state in localStorage (24h TTL)
- On page load, `WalletCast.connect()` tries `provider.restoreSession()` first
- Sends ping, waits for pong (5s timeout), reconnects silently

**Connector side** (in `packages/deep-link/src/connector/main.ts`):
- Saves keypair + connection state in localStorage
- On reload with same dapp pubkey, restores without `eth_requestAccounts`
- Verifies accounts haven't changed

### Nostr RPC Messages (Deep Link mode)
```typescript
type NostrRpcMessage =
  | { type: 'session'; accounts: string[]; chainId: string }
  | { type: 'request'; id: number; method: string; params: unknown[] }
  | { type: 'response'; id: number; result?: unknown; error?: { ... } }
  | { type: 'event'; name: string; data: unknown }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'disconnect' };
```

### QR Modal (Shadow DOM)
`QRModal` in `packages/sdk/src/qr-modal.ts`:
- Attached via Shadow DOM for complete style isolation
- Wallet picker -> QR code display -> success animation
- Dark/light theme, auto-closes on connection

### Wallet Registry
`WALLET_REGISTRY` in `packages/deep-link/src/wallets.ts` maps wallet IDs to deep link URL generators:
```typescript
type WalletId = 'metamask' | 'trust' | 'coinbase' | 'phantom' | 'okx';
```

## Common Tasks

### Adding a new wallet
1. Add entry to `WALLET_REGISTRY` in `packages/deep-link/src/wallets.ts`
2. Add to `WalletId` union type in `packages/deep-link/src/types.ts`
3. Add icon in `WALLET_ICONS` in `packages/sdk/src/qr-modal.ts`
4. Add to `WALLET_ORDER` array in `packages/sdk/src/qr-modal.ts`

### Adding a new RPC method to read/sign routing
Edit `packages/provider/src/rpc-router.ts` -- add the method name to the appropriate list.

### Modifying the connector page
1. Edit `packages/deep-link/connector/template.html` (HTML/CSS) or `packages/deep-link/src/connector/main.ts` (runtime logic)
2. Rebuild: `pnpm --filter @walletcast/deep-link build:connector`
3. Output: `packages/deep-link/dist/connector.html`

### Deploying connector to clawd
```bash
scp packages/deep-link/dist/* clawd:~/.openclaw/workspace/workspace/walletcast/
ssh clawd 'cd ~/.openclaw/workspace && docker compose exec sandbox bash -c "cp /workspace/walletcast/* /var/www/walletcast/"'
```
Cloudflare may need cache purge after deploy at `https://machinemade.name/walletcast/`.

## File Structure

```
walletcast/
+-- packages/
|   +-- types/           # Shared TypeScript interfaces
|   +-- crypto/          # secp256k1 key generation
|   +-- uri/             # URI generation/parsing
|   +-- qr/              # Zero-dep QR code generator
|   +-- webrtc/          # WebRTC peer connection
|   +-- nostr-signaling/ # Nostr relay pool + encryption
|   +-- libp2p-signaling/# Rust/WASM libp2p
|   +-- broker/          # SovereignBroker orchestrator
|   +-- provider/        # EIP-1193 provider + RPC router
|   +-- deep-link/       # Deep link provider + connector page
|   |   +-- src/
|   |   |   +-- deep-link-provider.ts  # EIP-1193 provider over Nostr
|   |   |   +-- session-manager.ts     # Dapp-side session persistence
|   |   |   +-- nostr-rpc.ts           # Encrypted Nostr RPC transport
|   |   |   +-- connector/             # Connector page source (esbuild)
|   |   |       +-- main.ts            # Connector runtime (session persist, disconnect)
|   |   |       +-- crypto-lite.ts     # Minimal crypto (ECDH, AES-GCM)
|   |   +-- connector/                 # template.html + static files
|   |   +-- scripts/                   # build-connector.mjs
|   |   +-- dist/                      # Built connector.html (gitignored)
|   +-- sdk/             # Unified facade
|       +-- src/
|           +-- walletcast.ts   # connect(), createDeepLinkProvider()
|           +-- qr-modal.ts     # Shadow DOM QR modal
|           +-- p2p.ts          # Stashed P2P exports (@walletcast/sdk/p2p)
|           +-- defaults.ts     # Default relay URLs
+-- apps/
|   +-- demo-dapp/       # Vite-based demo app
+-- examples/
|   +-- vanilla-connect/ # No-build-step vanilla JS example
+-- turbo.json
+-- pnpm-workspace.yaml
+-- vitest.workspace.ts
```
