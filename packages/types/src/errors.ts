export enum WalletCastErrorCode {
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,
  SIGNALING_TIMEOUT = 5001,
  WEBRTC_FAILED = 5002,
  ENCRYPTION_FAILED = 5003,
  INVALID_URI = 5004,
}

export class WalletCastError extends Error {
  constructor(
    public readonly code: WalletCastErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WalletCastError';
  }
}
