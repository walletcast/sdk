import type { DataChannelHandle } from '@walletcast/types';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';
import { DataChannelWrapper } from './data-channel.js';

export interface PeerConnectionConfig {
  iceServers?: RTCIceServer[];
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export class WalletCastPeerConnection {
  private pc: RTCPeerConnection;

  constructor(config?: PeerConnectionConfig) {
    this.pc = new RTCPeerConnection({
      iceServers: config?.iceServers ?? DEFAULT_ICE_SERVERS,
    });
  }

  /** Initiator: create offer + data channel */
  async createOffer(): Promise<{
    sdp: string;
    dataChannel: DataChannelHandle;
  }> {
    const dc = this.pc.createDataChannel('walletcast', { ordered: true });
    dc.binaryType = 'arraybuffer';

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForICEGathering();

    return {
      sdp: this.pc.localDescription!.sdp,
      dataChannel: new DataChannelWrapper(dc),
    };
  }

  /** Responder: receive offer, produce answer + data channel */
  async createAnswer(
    remoteSdp: string,
  ): Promise<{ sdp: string; dataChannel: DataChannelHandle }> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });

    const dcPromise = this.waitForDataChannel();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForICEGathering();

    const dc = await dcPromise;

    return {
      sdp: this.pc.localDescription!.sdp,
      dataChannel: new DataChannelWrapper(dc),
    };
  }

  /** Initiator: set the remote answer */
  async setRemoteAnswer(remoteSdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp });
  }

  /** Add a remote ICE candidate */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  /** Listen for connection state changes */
  onConnectionStateChange(
    handler: (state: RTCPeerConnectionState) => void,
  ): void {
    this.pc.onconnectionstatechange = () => handler(this.pc.connectionState);
  }

  /** Close the peer connection */
  close(): void {
    this.pc.close();
  }

  private waitForICEGathering(timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        // Resolve anyway -- we have the candidates gathered so far
        resolve();
      }, timeout);
      this.pc.onicegatheringstatechange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }

  private waitForDataChannel(timeout = 10000): Promise<RTCDataChannel> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new WalletCastError(
            WalletCastErrorCode.WEBRTC_FAILED,
            'DataChannel timeout',
          ),
        );
      }, timeout);
      this.pc.ondatachannel = (event) => {
        clearTimeout(timer);
        resolve(event.channel);
      };
    });
  }
}
