export interface SDPPayload {
  type: 'offer' | 'answer';
  sdp: string;
  senderPubKey: string;
  recipientPubKey: string;
  nonce: string;
  timestamp: number;
}

export interface ICEPayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  senderPubKey: string;
}

export type SignalingMessage =
  | { kind: 'sdp'; payload: SDPPayload }
  | { kind: 'ice'; payload: ICEPayload };

export interface ISignaler {
  publish(message: SignalingMessage): Promise<void>;
  subscribe(
    recipientPubKey: string,
    onMessage: (msg: SignalingMessage) => void,
  ): Promise<() => void>;
  destroy(): Promise<void>;
}
