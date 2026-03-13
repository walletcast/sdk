export {
  WalletCast,
  type ConnectOptions,
  type ConnectResult,
  type DisconnectOptions,
} from './walletcast.js';

export { QRModal, type QRModalOptions } from './qr-modal.js';

// Re-export key types from sub-packages
export type {
  KeyPair,
  EIP1193Provider,
  WalletCastProviderConfig,
} from '@walletcast/types';

export {
  WalletCastError,
  WalletCastErrorCode,
  isReadMethod,
  isSigningMethod,
} from '@walletcast/types';

export { WalletCastProvider, announceProvider, ProviderRpcError } from '@walletcast/provider';
export { generateKeyPair } from '@walletcast/crypto';
export { encodeQR, renderSVG, renderCanvas, toSVGDataURL } from '@walletcast/qr';
export type { QRCode, QROptions, SVGOptions, CanvasOptions } from '@walletcast/qr';
export {
  DeepLinkProvider,
  NostrRpc,
  SessionManager,
  WALLET_REGISTRY,
  generateDeepLink,
  generateAllDeepLinks,
  generateConnectorUrl,
} from '@walletcast/deep-link';
export type {
  WalletId,
  WalletInfo,
  DeepLinkConfig,
  DeepLinkResult,
  DappSession,
  RestoredSessionState,
  NostrRpcMessage,
} from '@walletcast/deep-link';
