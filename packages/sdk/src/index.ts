export { WalletCast, type WalletCastOptions } from './walletcast.js';

// Re-export key types and classes from sub-packages
export type {
  KeyPair,
  WalletCastURI,
  ISignaler,
  IBroker,
  DataChannelHandle,
  SignalingMessage,
  BrokerConfig,
  EIP1193Provider,
  WalletCastProviderConfig,
  MessageEnvelope,
} from '@walletcast/types';

export {
  WalletCastError,
  WalletCastErrorCode,
  MessageType,
  URI_SCHEME,
  URI_VERSION,
  isReadMethod,
  isSigningMethod,
} from '@walletcast/types';

export { SovereignBroker } from '@walletcast/broker';
export { WalletCastProvider, announceProvider, ProviderRpcError } from '@walletcast/provider';
export { parseURI, generateURI, isValidURI } from '@walletcast/uri';
export { generateKeyPair } from '@walletcast/crypto';
export { NostrSignaler } from '@walletcast/nostr-signaling';
export { LibP2PSignaler } from '@walletcast/libp2p-signaling';
export {
  WalletCastPeerConnection,
  DataChannelWrapper,
  encodeEnvelope,
  decodeEnvelope,
} from '@walletcast/webrtc';
