/**
 * WalletCast Connector Page
 *
 * Runs inside a wallet's in-app browser. Bridges window.ethereum <-> Nostr
 * relays so a desktop dapp can communicate with the wallet remotely.
 *
 * URL format: https://walletcast.net/c/{pubkey_base64url}/{relay1}/{relay2}/...
 *
 * Features:
 * - Session persistence (localStorage) — survives page reloads
 * - Disconnect button — sends { type: 'disconnect' } to dapp
 */
import { NostrLitePool } from './nostr-lite.js';
import {
  generateKeyPair,
  restoreKeyPair,
  deriveSharedKey,
  encrypt,
  decrypt,
  createNostrEvent,
  bytesToHex,
} from './crypto-lite.js';

const SIGNALING_KIND = 21059;
const SESSION_KEY = 'walletcast_connector_v1';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface ConnectorSession {
  version: 1;
  privateKeyHex: string;
  publicKeyHex: string;
  dappPubKey: string;
  relays: string[];
  accounts: string[];
  chainId: string;
  createdAt: number;
}

// --- UI Helpers ---
function setStatus(text: string, type: 'info' | 'error' | 'success' = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.className = `status-${type}`;
}

function log(msg: string) {
  const el = document.getElementById('log');
  if (!el) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function showDisconnectButton(onDisconnect: () => void) {
  const btn = document.getElementById('disconnectBtn');
  if (!btn) return;
  btn.style.display = 'block';
  btn.addEventListener('click', onDisconnect, { once: true });
}

// --- Session persistence ---
function saveSession(session: ConnectorSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

function loadSession(dappPubKey: string, relays: string[]): ConnectorSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ConnectorSession;

    if (session.version !== 1) return null;
    if (session.dappPubKey !== dappPubKey) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      clearSession();
      return null;
    }
    // Relay sets should overlap
    const savedSet = new Set(session.relays);
    if (!relays.some((r) => savedSet.has(r))) return null;

    return session;
  } catch {
    return null;
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

// --- Parse URL params ---
function base64urlToHex(b64: string): string | null {
  try {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const bin = atob(padded + '='.repeat(padLen));
    return Array.from(bin)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function parseConnectionParams(): { pubkey: string; relays: string[] } | null {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // Expect: ['c', pubkey_b64url, relay1_host, relay2_host, ...]
  if (parts[0] !== 'c' || parts.length < 3) return null;

  const pubkey = base64urlToHex(parts[1]);
  if (!pubkey || pubkey.length !== 64) return null;

  const relays = parts.slice(2).map((h) => `wss://${h}`);
  return { pubkey, relays };
}

// --- Detect wallet provider ---
async function getProvider(): Promise<{
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
} | null> {
  const w = window as unknown as {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  };
  if (w.ethereum) return w.ethereum;

  await new Promise((r) => setTimeout(r, 500));
  if (w.ethereum) return w.ethereum;

  // Try EIP-6963
  return new Promise((resolve) => {
    let found = false;
    window.addEventListener('eip6963:announceProvider', ((e: CustomEvent) => {
      if (!found && e.detail?.provider) {
        found = true;
        resolve(e.detail.provider);
      }
    }) as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      if (!found) resolve(null);
    }, 2000);
  });
}

// --- Main ---
async function main() {
  setStatus('Initializing...', 'info');

  // 1. Parse connection params
  const params = parseConnectionParams();
  if (!params) {
    const landing = document.getElementById('landing');
    if (landing) landing.classList.add('active');
    return;
  }

  // Has params — show connector UI
  const connector = document.getElementById('connector');
  if (connector) connector.classList.add('active');

  log(`Dapp pubkey: ${params.pubkey.slice(0, 16)}...`);
  log(`Relays: ${params.relays.join(', ')}`);

  // 2. Detect wallet provider
  setStatus('Detecting wallet...', 'info');
  const provider = await getProvider();
  if (!provider) {
    setStatus('No wallet detected. Please open this page in a wallet browser.', 'error');
    return;
  }
  log('Wallet provider detected');

  // 3. Check for saved session
  const saved = loadSession(params.pubkey, params.relays);
  let privateKey: Uint8Array;
  let publicKeyHex: string;
  let accounts: string[];
  let chainId: string;
  let isRestoredSession = false;

  if (saved) {
    log('Restoring previous session...');
    setStatus('Restoring session...', 'info');

    // Restore keypair
    const restored = restoreKeyPair(saved.privateKeyHex);
    privateKey = restored.privateKey;
    publicKeyHex = restored.publicKeyHex;

    // Verify wallet still has same accounts
    try {
      const currentAccounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      if (
        currentAccounts.length > 0 &&
        currentAccounts[0]?.toLowerCase() === saved.accounts[0]?.toLowerCase()
      ) {
        accounts = currentAccounts;
        chainId = (await provider.request({ method: 'eth_chainId' })) as string;
        isRestoredSession = true;
        log('Session restored — same wallet accounts');
      } else {
        // Accounts changed — start fresh
        log('Accounts changed since last session, starting fresh');
        clearSession();
        accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
        chainId = (await provider.request({ method: 'eth_chainId' })) as string;
        const fresh = generateKeyPair();
        privateKey = fresh.privateKey;
        publicKeyHex = fresh.publicKeyHex;
      }
    } catch {
      // Can't get accounts silently — request permission
      clearSession();
      accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      chainId = (await provider.request({ method: 'eth_chainId' })) as string;
      const fresh = generateKeyPair();
      privateKey = fresh.privateKey;
      publicKeyHex = fresh.publicKeyHex;
    }
  } else {
    // Fresh session
    setStatus('Requesting wallet access...', 'info');
    try {
      accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setStatus(`Wallet rejected: ${msg}`, 'error');
      return;
    }

    if (!accounts || accounts.length === 0) {
      setStatus('No accounts returned by wallet.', 'error');
      return;
    }

    chainId = (await provider.request({ method: 'eth_chainId' })) as string;
    const fresh = generateKeyPair();
    privateKey = fresh.privateKey;
    publicKeyHex = fresh.publicKeyHex;
  }

  log(`Accounts: ${accounts.join(', ')}`);
  log(`Chain: ${chainId}`);
  log(`Connector pubkey: ${publicKeyHex.slice(0, 16)}...`);

  // 5. Connect to Nostr relays
  setStatus('Connecting to relays...', 'info');
  const pool = new NostrLitePool();
  pool.connect(params.relays);
  await new Promise((r) => setTimeout(r, 1000));

  // Helper: send encrypted message to dapp
  async function sendToDapp(message: object): Promise<void> {
    const recipientCompressed = '02' + params!.pubkey;
    const sharedKey = await deriveSharedKey(privateKey, recipientCompressed);
    const content = await encrypt(sharedKey, JSON.stringify(message));
    const event = createNostrEvent(
      privateKey,
      publicKeyHex,
      SIGNALING_KIND,
      content,
      [['p', params!.pubkey]],
    );
    pool.publish(event);
  }

  // 6. Send session announcement
  await sendToDapp({ type: 'session', accounts, chainId });
  log(isRestoredSession ? 'Session re-announced to dapp' : 'Session announced to dapp');
  setStatus('Connected! Keep this tab open.', 'success');

  // Save session for future restores
  saveSession({
    version: 1,
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex,
    dappPubKey: params.pubkey,
    relays: params.relays,
    accounts,
    chainId,
    createdAt: isRestoredSession ? (saved?.createdAt ?? Date.now()) : Date.now(),
  });

  // 7. Subscribe to messages from dapp
  const since = Math.floor(Date.now() / 1000) - 30;
  pool.subscribe(
    { kinds: [SIGNALING_KIND], '#p': [publicKeyHex], since },
    async (event) => {
      try {
        const senderCompressed = '02' + event.pubkey;
        const sharedKey = await deriveSharedKey(privateKey, senderCompressed);
        const plaintext = await decrypt(sharedKey, event.content);
        const msg = JSON.parse(plaintext) as {
          type: string;
          id?: number;
          method?: string;
          params?: unknown[];
        };

        if (msg.type === 'request' && msg.method && msg.id !== undefined) {
          log(`RPC: ${msg.method}`);
          try {
            const result = await provider.request({
              method: msg.method,
              params: msg.params,
            });
            await sendToDapp({ type: 'response', id: msg.id, result });
          } catch (err: unknown) {
            const rpcErr = err as { code?: number; message?: string };
            await sendToDapp({
              type: 'response',
              id: msg.id,
              error: {
                code: rpcErr.code ?? -32603,
                message: rpcErr.message ?? 'Internal error',
              },
            });
          }
        } else if (msg.type === 'ping') {
          await sendToDapp({ type: 'pong' });
        }
      } catch {
        // Decryption failure — not for us or malformed
      }
    },
  );

  // 8. Forward wallet events to dapp
  if (provider.on) {
    provider.on('accountsChanged', async (...args: unknown[]) => {
      const newAccounts = args[0] as string[];
      accounts = newAccounts;
      log(`Event: accountsChanged -> ${newAccounts.join(', ')}`);
      await sendToDapp({ type: 'event', name: 'accountsChanged', data: newAccounts });
    });

    provider.on('chainChanged', async (...args: unknown[]) => {
      const newChain = args[0] as string;
      chainId = newChain;
      log(`Event: chainChanged -> ${newChain}`);
      await sendToDapp({ type: 'event', name: 'chainChanged', data: newChain });
    });
  }

  // 9. Periodic session re-announcement
  let reannounceCount = 0;
  const reannounceInterval = setInterval(async () => {
    reannounceCount++;
    if (reannounceCount > 5) {
      clearInterval(reannounceInterval);
      return;
    }
    await sendToDapp({ type: 'session', accounts, chainId });
  }, 3000);

  // 10. Disconnect button
  showDisconnectButton(async () => {
    log('Disconnecting...');
    clearInterval(reannounceInterval);
    await sendToDapp({ type: 'disconnect' });
    clearSession();
    pool.close();
    setStatus('Disconnected.', 'info');
    log('Session ended. You can close this tab.');
    const btn = document.getElementById('disconnectBtn');
    if (btn) btn.style.display = 'none';
  });
}

// Boot
main().catch((err) => {
  setStatus(`Fatal error: ${err.message}`, 'error');
});
