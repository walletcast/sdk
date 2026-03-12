import type { KeyPair } from './crypto.js';
import type { DataChannelHandle } from './transport.js';
import type { WalletCastURI } from './uri.js';

export interface BrokerConfig {
  keypair: KeyPair;
  nostrRelays?: string[];
  libp2pBootnodes?: string[];
  iceServers?: RTCIceServer[];
  timeout?: number; // ms, default 15000
}

export interface IBroker {
  connect(remoteUri: WalletCastURI): Promise<DataChannelHandle>;
  listen(onIncoming: (channel: DataChannelHandle) => void): Promise<void>;
  destroy(): Promise<void>;
}
