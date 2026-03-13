/**
 * P2P exports — WebRTC + signaling + broker.
 *
 * Import from '@walletcast/sdk/p2p' to use native peer-to-peer connections.
 * These are not included in the default SDK exports to reduce bundle size.
 */
export { SovereignBroker } from '@walletcast/broker';
export { NostrSignaler } from '@walletcast/nostr-signaling';
export { LibP2PSignaler } from '@walletcast/libp2p-signaling';
export {
  WalletCastPeerConnection,
  DataChannelWrapper,
  encodeEnvelope,
  decodeEnvelope,
} from '@walletcast/webrtc';

export type {
  ISignaler,
  IBroker,
  DataChannelHandle,
  SignalingMessage,
  BrokerConfig,
  MessageEnvelope,
} from '@walletcast/types';

export {
  MessageType,
  URI_SCHEME,
  URI_VERSION,
} from '@walletcast/types';

export { parseURI, generateURI, isValidURI } from '@walletcast/uri';
