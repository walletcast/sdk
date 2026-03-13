import type {
  IBroker,
  BrokerConfig,
  DataChannelHandle,
  WalletCastURI,
  SignalingMessage,
} from '@walletcast/types';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';
import { NostrSignaler } from '@walletcast/nostr-signaling';
import { LibP2PSignaler } from '@walletcast/libp2p-signaling';
import { WalletCastPeerConnection } from '@walletcast/webrtc';
import { randomBytes, bytesToHex } from '@walletcast/crypto';

const DEFAULT_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const DEFAULT_TIMEOUT = 15_000;

export class SovereignBroker implements IBroker {
  private nostrSignaler: NostrSignaler;
  private libp2pSignaler: LibP2PSignaler;
  private peerConnection: WalletCastPeerConnection | null = null;
  private timeout: number;

  constructor(private config: BrokerConfig) {
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.nostrSignaler = new NostrSignaler(
      config.nostrRelays ?? DEFAULT_NOSTR_RELAYS,
      config.keypair,
    );
    this.libp2pSignaler = new LibP2PSignaler(
      config.libp2pBootnodes ?? [],
      config.keypair,
    );
  }

  async connect(remoteUri: WalletCastURI): Promise<DataChannelHandle> {
    const pc = new WalletCastPeerConnection({
      iceServers: this.config.iceServers,
    });

    const { sdp: offerSdp, dataChannel } = await pc.createOffer();

    const nonce = bytesToHex(randomBytes(16));
    const offerMessage: SignalingMessage = {
      kind: 'sdp',
      payload: {
        type: 'offer',
        sdp: offerSdp,
        senderPubKey: this.config.keypair.publicKeyHex,
        recipientPubKey: remoteUri.publicKey,
        nonce,
        timestamp: Date.now(),
      },
    };

    await Promise.allSettled([
      this.nostrSignaler.publish(offerMessage),
      this.libp2pSignaler.publish(offerMessage).catch(() => {}),
    ]);

    const answerSdp = await this.raceForAnswer(
      this.config.keypair.publicKeyHex,
    );

    await pc.setRemoteAnswer(answerSdp);
    this.peerConnection = pc;

    await this.waitForOpen(dataChannel);
    return dataChannel;
  }

  async listen(
    onIncoming: (channel: DataChannelHandle) => void,
  ): Promise<void> {
    await this.nostrSignaler.subscribe(
      this.config.keypair.publicKeyHex,
      async (msg) => {
        if (msg.kind !== 'sdp' || msg.payload.type !== 'offer') return;

        try {
          const pc = new WalletCastPeerConnection({
            iceServers: this.config.iceServers,
          });

          const { sdp: answerSdp, dataChannel } = await pc.createAnswer(
            msg.payload.sdp,
          );

          const answerMessage: SignalingMessage = {
            kind: 'sdp',
            payload: {
              type: 'answer',
              sdp: answerSdp,
              senderPubKey: this.config.keypair.publicKeyHex,
              recipientPubKey: msg.payload.senderPubKey,
              nonce: msg.payload.nonce,
              timestamp: Date.now(),
            },
          };

          await Promise.allSettled([
            this.nostrSignaler.publish(answerMessage),
            this.libp2pSignaler.publish(answerMessage).catch(() => {}),
          ]);

          await this.waitForOpen(dataChannel);
          onIncoming(dataChannel);
        } catch {
          // Don't crash the listener on individual connection failures
        }
      },
    );
  }

  async destroy(): Promise<void> {
    await this.nostrSignaler.destroy();
    await this.libp2pSignaler.destroy();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  private raceForAnswer(myPubKey: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new WalletCastError(
            WalletCastErrorCode.SIGNALING_TIMEOUT,
            `Signaling timeout after ${this.timeout}ms`,
          ),
        );
      }, this.timeout);

      const unsubs: Array<() => void> = [];

      const cleanup = () => {
        clearTimeout(timer);
        unsubs.forEach((fn) => fn());
      };

      const onAnswer = (msg: SignalingMessage) => {
        if (msg.kind === 'sdp' && msg.payload.type === 'answer') {
          cleanup();
          resolve(msg.payload.sdp);
        }
      };

      this.nostrSignaler
        .subscribe(myPubKey, onAnswer)
        .then((unsub) => unsubs.push(unsub))
        .catch(() => {});

      this.libp2pSignaler
        .subscribe(myPubKey, onAnswer)
        .then((unsub) => unsubs.push(unsub))
        .catch(() => {});
    });
  }

  private waitForOpen(
    channel: DataChannelHandle,
    timeout = 10_000,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (channel.readyState === 'open') {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        clearInterval(interval);
        reject(
          new WalletCastError(
            WalletCastErrorCode.WEBRTC_FAILED,
            'DataChannel did not open in time',
          ),
        );
      }, timeout);

      const interval = setInterval(() => {
        if (channel.readyState === 'open') {
          clearTimeout(timer);
          clearInterval(interval);
          resolve();
        } else if (
          channel.readyState === 'closed' ||
          channel.readyState === 'closing'
        ) {
          clearTimeout(timer);
          clearInterval(interval);
          reject(
            new WalletCastError(
              WalletCastErrorCode.WEBRTC_FAILED,
              'DataChannel closed before opening',
            ),
          );
        }
      }, 50);
    });
  }
}
