/**
 * URI validation without throwing exceptions.
 */
import { parseURI } from './parse.js';

/**
 * Check whether a URI string is a valid WalletCast URI.
 *
 * @param uri The URI string to validate
 * @returns true if valid, false otherwise
 */
export function isValidURI(uri: string): boolean {
  try {
    parseURI(uri);
    return true;
  } catch {
    return false;
  }
}
