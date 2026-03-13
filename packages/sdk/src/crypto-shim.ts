// Shim for Node.js "crypto" module in browser environments.
// WalletConnect's @walletconnect/core does `import "crypto"` which fails in browsers.
// The Web Crypto API (globalThis.crypto) provides the same functionality.
export default globalThis.crypto;
export const webcrypto = globalThis.crypto;
