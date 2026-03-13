/**
 * Dapp-side session persistence.
 *
 * Saves the ephemeral keypair, relay list, and wallet state so that a page
 * reload can silently reconnect via ping/pong instead of showing a new QR.
 */

export interface DappSession {
  version: 1;
  /** Dapp's private key (64-char hex) */
  privateKeyHex: string;
  /** Dapp's x-only public key (64-char hex) */
  publicKeyHex: string;
  /** Connector's x-only public key (64-char hex) */
  remotePubKey: string;
  /** Nostr relay URLs */
  relays: string[];
  /** Connected wallet accounts */
  accounts: string[];
  /** Hex chain ID (e.g. "0x1") */
  chainId: string;
  /** Public RPC endpoint */
  rpcUrl: string;
  /** Connector page base URL */
  connectorUrl: string;
  /** Unix ms when session was created */
  createdAt: number;
}

const DEFAULT_STORAGE_KEY = 'walletcast_session_v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionManager {
  private storageKey: string;
  private ttlMs: number;

  constructor(storageKey = DEFAULT_STORAGE_KEY, ttlMs = DEFAULT_TTL_MS) {
    this.storageKey = storageKey;
    this.ttlMs = ttlMs;
  }

  save(session: DappSession): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
  }

  load(): DappSession | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;

      const session = JSON.parse(raw) as DappSession;

      // Validate version
      if (session.version !== 1) return null;

      // Validate required fields
      if (
        !session.privateKeyHex ||
        !session.publicKeyHex ||
        !session.remotePubKey ||
        !session.relays?.length ||
        !session.accounts?.length ||
        !session.chainId ||
        !session.rpcUrl ||
        !session.connectorUrl
      ) {
        return null;
      }

      // TTL check
      if (Date.now() - session.createdAt > this.ttlMs) {
        this.clear();
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }
}
