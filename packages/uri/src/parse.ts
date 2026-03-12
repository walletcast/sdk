/**
 * Parse a WalletCast URI string into its components.
 *
 * Format: walletcast:v1:<PUBKEY_HEX>?r=<RELAY_URL>&r=<RELAY_URL2>&b=<BOOTNODE>
 */
import {
  WalletCastError,
  WalletCastErrorCode,
  URI_SCHEME,
  URI_VERSION,
  type WalletCastURI,
} from '@walletcast/types';

const PUBKEY_HEX_REGEX = /^(02|03)[0-9a-f]{64}$/;

/**
 * Parse a walletcast: URI string into a WalletCastURI object.
 *
 * @param uri The URI string to parse
 * @returns Parsed WalletCastURI
 * @throws WalletCastError with INVALID_URI code on invalid input
 */
export function parseURI(uri: string): WalletCastURI {
  if (!uri || typeof uri !== 'string') {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      'URI must be a non-empty string',
    );
  }

  // Split on '?' to separate the path from query params
  const [pathPart, queryPart] = uri.split('?');

  if (!pathPart) {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      'URI path is empty',
    );
  }

  // Parse path: walletcast:v1:<pubkey>
  const segments = pathPart.split(':');

  if (segments.length !== 3) {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      `Invalid URI format: expected "${URI_SCHEME}:${URI_VERSION}:<pubkey>", got "${pathPart}"`,
    );
  }

  const [scheme, version, publicKey] = segments;

  if (scheme !== URI_SCHEME) {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      `Invalid URI scheme: expected "${URI_SCHEME}", got "${scheme}"`,
    );
  }

  if (version !== URI_VERSION) {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      `Unsupported URI version: expected "${URI_VERSION}", got "${version}"`,
    );
  }

  // Validate public key: 66 hex chars, starts with 02 or 03
  const pubKeyLower = publicKey.toLowerCase();
  if (!PUBKEY_HEX_REGEX.test(pubKeyLower)) {
    throw new WalletCastError(
      WalletCastErrorCode.INVALID_URI,
      `Invalid public key: must be 66 hex characters (compressed secp256k1), got "${publicKey}"`,
    );
  }

  // Parse query parameters
  const relayUrls: string[] = [];
  const bootnodes: string[] = [];

  if (queryPart) {
    const params = new URLSearchParams(queryPart);

    for (const value of params.getAll('r')) {
      if (value) {
        relayUrls.push(decodeURIComponent(value));
      }
    }

    for (const value of params.getAll('b')) {
      if (value) {
        bootnodes.push(decodeURIComponent(value));
      }
    }
  }

  return {
    version: URI_VERSION,
    publicKey: pubKeyLower,
    relayUrls,
    bootnodes,
    raw: uri,
  };
}
