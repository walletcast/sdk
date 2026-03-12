export interface KeyPair {
  publicKey: Uint8Array; // 33 bytes compressed secp256k1
  privateKey: Uint8Array; // 32 bytes
  publicKeyHex: string;
}

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  mac: Uint8Array;
}
