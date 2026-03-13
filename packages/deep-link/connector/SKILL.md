---
name: walletcast-integration
description: Integrate WalletCast decentralized wallet connection into a web dapp
---

# WalletCast Integration

Add decentralized wallet connection to any web dapp using `@walletcast/sdk`. No WalletConnect Cloud, no project IDs, no centralized relays.

## 1. Install

```bash
npm install @walletcast/sdk
```

## 2. Connect (recommended — handles everything)

```typescript
import { WalletCast } from '@walletcast/sdk';

const { provider, accounts, type, chainId, disconnect } = await WalletCast.connect();

// Chain and accounts are detected from the wallet automatically
// type is 'injected' (used window.ethereum) or 'walletcast' (QR deep link)
console.log(`Connected via ${type} on chain ${chainId}:`, accounts);
```

`WalletCast.connect()` automatically:
1. Restores a saved session if one exists (silent reconnect via ping/pong)
2. Detects injected wallets (`window.ethereum` + EIP-6963)
3. Shows a Shadow DOM QR modal if no injected wallet found

### ConnectOptions

```typescript
{
  rpcUrl?: string;           // Optional — public RPC for read methods (if omitted, all requests go through wallet)
  chainId?: number;          // Optional — detected from wallet if omitted
  connectorUrl?: string;     // Default: 'https://walletcast.net/'
  nostrRelays?: string[];    // Override default Nostr relays
  preferInjected?: boolean;  // Default: true — check for injected wallet first
  theme?: 'dark' | 'light';  // QR modal theme (default: 'dark')
  walletId?: WalletId;       // Skip picker, go straight to specific wallet QR
}
```

### ConnectResult

```typescript
{
  provider: EIP1193Provider;  // Use for all RPC calls
  type: 'injected' | 'walletcast';
  accounts: string[];         // Connected accounts
  chainId: string;            // Hex chain ID (e.g. "0x1")
  disconnect: () => Promise<void>;  // Disconnect + clear session
}
```

## 3. Use Provider

The provider implements EIP-1193. Use it directly or wrap with ethers.js/viem.

### Direct EIP-1193

```typescript
const chainId = await provider.request({ method: 'eth_chainId' });
const balance = await provider.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] });
```

### With ethers.js v6

```typescript
import { BrowserProvider } from 'ethers';

const signer = await new BrowserProvider(provider).getSigner();
const tx = await signer.sendTransaction({ to: '0x...', value: parseEther('0.01') });
```

### With viem

```typescript
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';

const client = createWalletClient({ chain: mainnet, transport: custom(provider) });
```

## 4. Handle Events

```typescript
provider.on('connect', ({ chainId }) => console.log('Connected, chain:', chainId));
provider.on('accountsChanged', (accs) => console.log('Accounts:', accs));
provider.on('chainChanged', (chainId) => console.log('Chain:', chainId));
provider.on('disconnect', () => console.log('Disconnected'));
```

## 5. Disconnect

```typescript
await disconnect(); // Clears session on both sides
```

## 6. React Pattern

```typescript
import { useState, useCallback } from 'react';
import { WalletCast } from '@walletcast/sdk';
import type { ConnectResult } from '@walletcast/sdk';

function useWalletCast() {
  const [result, setResult] = useState<ConnectResult | null>(null);

  const connect = useCallback(async () => {
    const res = await WalletCast.connect();
    setResult(res);
    res.provider.on('disconnect', () => setResult(null));
    return res;
  }, []);

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

## 7. Lower-level API (custom QR UI)

If you want full control over the QR display:

```typescript
import { WalletCast, toSVGDataURL, WALLET_REGISTRY } from '@walletcast/sdk';
import type { WalletId } from '@walletcast/sdk';

const { provider, links, approval } = WalletCast.createDeepLinkProvider({
  connectorUrl: 'https://walletcast.net/',
});

const walletId: WalletId = 'metamask';
const qrSvg = toSVGDataURL(links[walletId].universal, { moduleSize: 6 });
document.querySelector<HTMLImageElement>('#qr').src = qrSvg;

const accounts = await approval;
```

## Supported Wallets

| WalletId | Name |
|----------|------|
| `metamask` | MetaMask |
| `trust` | Trust Wallet |
| `coinbase` | Coinbase Wallet |
| `phantom` | Phantom |
| `okx` | OKX Wallet |

## Testing

```typescript
const { provider, chainId } = await WalletCast.connect();
// chainId is auto-detected from whatever network the wallet is on
```

Test flow: start dev server, click connect, QR modal appears (if no injected wallet), scan with MetaMask mobile, connector bridges calls, dapp receives accounts and chain. Switch networks in the wallet to test chain detection.

## Reference

- [Integration Guide (AGENTS.md)](https://walletcast.net/AGENTS.md)
- [GitHub](https://github.com/nicholasgasior/walletcast)
- [npm](https://www.npmjs.com/package/@walletcast/sdk)
