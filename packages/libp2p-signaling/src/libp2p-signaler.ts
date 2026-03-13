import type { ISignaler, SignalingMessage, KeyPair } from '@walletcast/types';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';
import { encryptForPeer, decryptFromPeer, hexToBytes } from '@walletcast/crypto';

/**
 * Interface matching the WASM-exported LibP2PNode class.
 */
export interface WasmLibP2PNode {
  subscribe(topic: string, callback: (data: Uint8Array) => void): void;
  unsubscribe(topic: string): void;
  publish(topic: string, data: Uint8Array): void;
  destroy(): void;
}

export interface WasmModule {
  LibP2PNode: {
    create(bootnodes: string[]): Promise<WasmLibP2PNode>;
  };
}

let wasmModule: WasmModule | null = null;

/**
 * Set the WASM module for libp2p support.
 * Call after loading the WASM module via wasm-pack:
 *
 * ```ts
 * import init, * as wasm from '@walletcast/libp2p-signaling/wasm';
 * await init();
 * setLibP2PWasm(wasm);
 * ```
 */
export function setLibP2PWasm(wasm: WasmModule): void {
  wasmModule = wasm;
}

/**
 * libp2p-based signaling channel using gossipsub over WebSocket.
 *
 * Requires the Rust/WASM module to be loaded via `setLibP2PWasm()`.
 * Messages are encrypted end-to-end using ECDH + AES-GCM, mirroring
 * the encryption used by the Nostr signaler.
 *
 * Wire format per gossipsub message:
 *   [senderPubKeyHex: 66 chars][encrypted: base64 string]
 */
export class LibP2PSignaler implements ISignaler {
  private node: WasmLibP2PNode | null = null;
  private keypair: KeyPair;
  private bootnodes: string[];

  constructor(bootnodes: string[], keypair: KeyPair) {
    this.keypair = keypair;
    this.bootnodes = bootnodes;
  }

  /**
   * Check whether the WASM module has been loaded.
   */
  static async isAvailable(): Promise<boolean> {
    return wasmModule !== null;
  }

  private async ensureNode(): Promise<WasmLibP2PNode> {
    if (this.node) return this.node;
    if (!wasmModule) {
      throw new WalletCastError(
        WalletCastErrorCode.UNSUPPORTED_METHOD,
        'libp2p WASM module not loaded — call setLibP2PWasm() first',
      );
    }
    this.node = await wasmModule.LibP2PNode.create(this.bootnodes);
    return this.node;
  }

  async publish(message: SignalingMessage): Promise<void> {
    const node = await this.ensureNode();
    const recipientPubKeyHex = this.getRecipientPubKey(message);
    const recipientPubKey = hexToBytes(recipientPubKeyHex);

    // Encrypt the serialised message for the recipient
    const plaintext = JSON.stringify(message);
    const encrypted = await encryptForPeer(
      this.keypair.privateKey,
      recipientPubKey,
      plaintext,
    );

    // Wire format: [senderPubKeyHex (66 chars)][encrypted base64]
    const payload = this.keypair.publicKeyHex + encrypted;
    const data = new TextEncoder().encode(payload);

    // Gossipsub topic = recipient public key
    node.publish(recipientPubKeyHex, data);
  }

  async subscribe(
    recipientPubKey: string,
    onMessage: (msg: SignalingMessage) => void,
  ): Promise<() => void> {
    const node = await this.ensureNode();
    const topic = recipientPubKey;

    const callback = async (data: Uint8Array) => {
      try {
        const payload = new TextDecoder().decode(data);

        // Extract sender pubkey (66-char compressed hex) from the prefix
        const senderPubKeyHex = payload.slice(0, 66);
        const encrypted = payload.slice(66);
        const senderPubKey = hexToBytes(senderPubKeyHex);

        const plaintext = await decryptFromPeer(
          this.keypair.privateKey,
          senderPubKey,
          encrypted,
        );
        const message = JSON.parse(plaintext) as SignalingMessage;
        onMessage(message);
      } catch {
        // Decryption/parsing failed — message not intended for us or corrupted
      }
    };

    node.subscribe(topic, callback);

    return () => {
      node.unsubscribe(topic);
    };
  }

  async destroy(): Promise<void> {
    if (this.node) {
      this.node.destroy();
      this.node = null;
    }
  }

  private getRecipientPubKey(message: SignalingMessage): string {
    if (message.kind === 'sdp') {
      return message.payload.recipientPubKey;
    }
    return message.payload.senderPubKey;
  }
}
