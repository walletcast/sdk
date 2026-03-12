import type { WalletCastURI, KeyPair } from '@walletcast/types';
import { generateKeyPair } from '@walletcast/crypto';
import { parseURI, generateURI, type GenerateURIOptions } from '@walletcast/uri';
import { SovereignBroker } from '@walletcast/broker';
import { WalletCastProvider } from '@walletcast/provider';
import { DEFAULT_NOSTR_RELAYS, DEFAULT_ICE_SERVERS } from './defaults.js';

export interface WalletCastOptions {
  rpcUrl: string;
  chainId: number;
  nostrRelays?: string[];
  iceServers?: RTCIceServer[];
}

export class WalletCast {
  static createProvider(options: WalletCastOptions): WalletCastProvider {
    const keypair = generateKeyPair();

    const broker = new SovereignBroker({
      keypair,
      nostrRelays: options.nostrRelays ?? DEFAULT_NOSTR_RELAYS,
      iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
    });

    return new WalletCastProvider({
      broker,
      rpcUrl: options.rpcUrl,
      chainId: options.chainId,
    });
  }

  static generateURI(options: GenerateURIOptions): string {
    return generateURI(options);
  }

  static parseURI(uri: string): WalletCastURI {
    return parseURI(uri);
  }

  static generateKeyPair(): KeyPair {
    return generateKeyPair();
  }
}
