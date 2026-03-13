import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletCastPeerConnection } from '../src/peer-connection.js';
import { WalletCastError, WalletCastErrorCode } from '@walletcast/types';

// ---------------------------------------------------------------------------
// Mock RTCDataChannel
// ---------------------------------------------------------------------------
class MockRTCDataChannel {
  binaryType = 'blob';
  readyState = 'open';
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

// ---------------------------------------------------------------------------
// Mock RTCPeerConnection
//
// The real createAnswer() flow in WalletCastPeerConnection is:
//   1. await setRemoteDescription(offer)
//   2. dcPromise = waitForDataChannel()  — sets up this.pc.ondatachannel handler
//   3. await createAnswer()
//   4. await setLocalDescription(answer)
//   5. await waitForICEGathering()       — waits for onicegatheringstatechange
//   6. await dcPromise                   — waits for ondatachannel
//
// The ondatachannel handler is registered in step 2 (after setRemoteDescription
// returns). So the mock must fire the ondatachannel event *after* that handler
// is registered. We use a setter on ondatachannel to detect when it's assigned
// and then fire the event.
// ---------------------------------------------------------------------------
class MockRTCPeerConnection {
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';

  onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  private _config: RTCConfiguration;
  private _pendingDataChannel: MockRTCDataChannel | null = null;
  private _ondatachannel: ((e: RTCDataChannelEvent) => void) | null = null;

  constructor(config?: RTCConfiguration) {
    this._config = config ?? {};
    mockPCInstances.push(this);
  }

  get config(): RTCConfiguration {
    return this._config;
  }

  /**
   * When ondatachannel is assigned and a data channel event is pending,
   * fire it immediately (via microtask) so the handler receives it.
   */
  get ondatachannel(): ((e: RTCDataChannelEvent) => void) | null {
    return this._ondatachannel;
  }

  set ondatachannel(handler: ((e: RTCDataChannelEvent) => void) | null) {
    this._ondatachannel = handler;
    if (handler && this._pendingDataChannel) {
      const dc = this._pendingDataChannel;
      this._pendingDataChannel = null;
      queueMicrotask(() => {
        handler({
          channel: dc as unknown as RTCDataChannel,
        } as RTCDataChannelEvent);
      });
    }
  }

  createDataChannel(_label: string, _opts?: RTCDataChannelInit): RTCDataChannel {
    const dc = new MockRTCDataChannel();
    return dc as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = {
      type: desc.type!,
      sdp: desc.sdp!,
      toJSON: () => ({ type: desc.type!, sdp: desc.sdp! }),
    } as RTCSessionDescription;

    // By default, simulate ICE gathering completing immediately (after microtask)
    if (autoCompleteICE) {
      queueMicrotask(() => {
        this.iceGatheringState = 'complete';
        this.onicegatheringstatechange?.();
      });
    }
  }

  async setRemoteDescription(
    desc: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = {
      type: desc.type!,
      sdp: desc.sdp!,
      toJSON: () => ({ type: desc.type!, sdp: desc.sdp! }),
    } as RTCSessionDescription;

    // When a remote offer is set and autoFireDataChannel is on, queue the
    // data channel event. It will fire once ondatachannel is assigned.
    if (desc.type === 'offer' && autoFireDataChannel) {
      this._pendingDataChannel = new MockRTCDataChannel();
    }
  }

  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
}

// ---------------------------------------------------------------------------
// Mock RTCSessionDescription
// ---------------------------------------------------------------------------
class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
  toJSON() {
    return { type: this.type, sdp: this.sdp };
  }
}

// ---------------------------------------------------------------------------
// Test control flags
// ---------------------------------------------------------------------------
let autoCompleteICE = true;
let autoFireDataChannel = true;
let mockPCInstances: MockRTCPeerConnection[] = [];

// ---------------------------------------------------------------------------
// Install mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  autoCompleteICE = true;
  autoFireDataChannel = true;
  mockPCInstances = [];

  globalThis.RTCPeerConnection =
    MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
  globalThis.RTCSessionDescription =
    MockRTCSessionDescription as unknown as typeof RTCSessionDescription;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('WalletCastPeerConnection', () => {
  // -----------------------------------------------------------------------
  // Default ICE servers
  // -----------------------------------------------------------------------
  describe('ICE server configuration', () => {
    it('uses default ICE servers including stun.l.google.com and stun.cloudflare.com', () => {
      const _pc = new WalletCastPeerConnection();

      expect(mockPCInstances).toHaveLength(1);
      const config = mockPCInstances[0].config;
      const urls = (config.iceServers ?? []).map((s) =>
        typeof s.urls === 'string' ? s.urls : s.urls[0],
      );

      expect(urls).toContain('stun:stun.l.google.com:19302');
      expect(urls).toContain('stun:stun.cloudflare.com:3478');
    });

    it('accepts custom ICE servers via config', () => {
      const customServers: RTCIceServer[] = [
        { urls: 'stun:custom.example.com:3478' },
        { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
      ];

      const _pc = new WalletCastPeerConnection({ iceServers: customServers });

      expect(mockPCInstances).toHaveLength(1);
      expect(mockPCInstances[0].config.iceServers).toEqual(customServers);
    });
  });

  // -----------------------------------------------------------------------
  // createOffer
  // -----------------------------------------------------------------------
  describe('createOffer()', () => {
    it('returns SDP string and DataChannelHandle', async () => {
      const pc = new WalletCastPeerConnection();
      const result = await pc.createOffer();

      expect(typeof result.sdp).toBe('string');
      expect(result.sdp).toBe('mock-offer-sdp');

      // DataChannelHandle duck-type check
      expect(result.dataChannel).toBeDefined();
      expect(typeof result.dataChannel.send).toBe('function');
      expect(typeof result.dataChannel.onMessage).toBe('function');
      expect(typeof result.dataChannel.onClose).toBe('function');
      expect(typeof result.dataChannel.close).toBe('function');
    });

    it('creates a data channel named "walletcast" with ordered=true', async () => {
      const spy = vi.spyOn(MockRTCPeerConnection.prototype, 'createDataChannel');

      const pc = new WalletCastPeerConnection();
      await pc.createOffer();

      expect(spy).toHaveBeenCalledWith('walletcast', { ordered: true });
    });
  });

  // -----------------------------------------------------------------------
  // createAnswer
  // -----------------------------------------------------------------------
  describe('createAnswer()', () => {
    it('sets remote description and returns answer SDP + DataChannelHandle', async () => {
      const pc = new WalletCastPeerConnection();
      const result = await pc.createAnswer('remote-offer-sdp');

      // Verify remote description was set with the offer
      expect(mockPCInstances[0].remoteDescription?.sdp).toBe(
        'remote-offer-sdp',
      );
      expect(mockPCInstances[0].remoteDescription?.type).toBe('offer');

      // Verify answer SDP returned
      expect(typeof result.sdp).toBe('string');
      expect(result.sdp).toBe('mock-answer-sdp');

      // DataChannelHandle
      expect(result.dataChannel).toBeDefined();
      expect(typeof result.dataChannel.send).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // setRemoteAnswer
  // -----------------------------------------------------------------------
  describe('setRemoteAnswer()', () => {
    it('sets remote description with type answer', async () => {
      const pc = new WalletCastPeerConnection();

      // First create an offer so we are in the right state
      await pc.createOffer();

      await pc.setRemoteAnswer('remote-answer-sdp');

      expect(mockPCInstances[0].remoteDescription?.sdp).toBe(
        'remote-answer-sdp',
      );
      expect(mockPCInstances[0].remoteDescription?.type).toBe('answer');
    });
  });

  // -----------------------------------------------------------------------
  // addIceCandidate
  // -----------------------------------------------------------------------
  describe('addIceCandidate()', () => {
    it('adds candidate to the peer connection', async () => {
      const pc = new WalletCastPeerConnection();

      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:123 1 udp 456 1.2.3.4 5678 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      await pc.addIceCandidate(candidate);

      expect(mockPCInstances[0].addIceCandidate).toHaveBeenCalledWith(
        candidate,
      );
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------
  describe('close()', () => {
    it('closes the underlying RTCPeerConnection', () => {
      const pc = new WalletCastPeerConnection();
      pc.close();

      expect(mockPCInstances[0].close).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // onConnectionStateChange
  // -----------------------------------------------------------------------
  describe('onConnectionStateChange()', () => {
    it('registers handler that receives connection state', () => {
      const pc = new WalletCastPeerConnection();
      const handler = vi.fn();

      pc.onConnectionStateChange(handler);

      // Simulate connection state change
      const mock = mockPCInstances[0];
      mock.connectionState = 'connected';
      mock.onconnectionstatechange?.();

      expect(handler).toHaveBeenCalledWith('connected');
    });

    it('handler receives different states', () => {
      const pc = new WalletCastPeerConnection();
      const handler = vi.fn();

      pc.onConnectionStateChange(handler);

      const mock = mockPCInstances[0];

      mock.connectionState = 'connecting';
      mock.onconnectionstatechange?.();
      expect(handler).toHaveBeenCalledWith('connecting');

      mock.connectionState = 'disconnected';
      mock.onconnectionstatechange?.();
      expect(handler).toHaveBeenCalledWith('disconnected');

      mock.connectionState = 'failed';
      mock.onconnectionstatechange?.();
      expect(handler).toHaveBeenCalledWith('failed');

      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // ICE gathering timeout
  // -----------------------------------------------------------------------
  describe('ICE gathering timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves after 5s timeout if ICE gathering never completes', async () => {
      autoCompleteICE = false;

      const pc = new WalletCastPeerConnection();
      const offerPromise = pc.createOffer();

      // Advance past the 5s ICE gathering timeout
      await vi.advanceTimersByTimeAsync(5000);

      const result = await offerPromise;
      expect(result.sdp).toBe('mock-offer-sdp');
    });

    it('resolves immediately if ICE gathering is already complete', async () => {
      // Override setLocalDescription to set iceGatheringState = 'complete'
      // synchronously (before the code checks it)
      const originalSetLocal =
        MockRTCPeerConnection.prototype.setLocalDescription;
      MockRTCPeerConnection.prototype.setLocalDescription = async function (
        this: MockRTCPeerConnection,
        desc: RTCSessionDescriptionInit,
      ) {
        this.localDescription = {
          type: desc.type!,
          sdp: desc.sdp!,
          toJSON: () => ({ type: desc.type!, sdp: desc.sdp! }),
        } as RTCSessionDescription;
        this.iceGatheringState = 'complete';
      };
      autoCompleteICE = false;

      const pc = new WalletCastPeerConnection();
      const result = await pc.createOffer();

      expect(result.sdp).toBe('mock-offer-sdp');

      MockRTCPeerConnection.prototype.setLocalDescription = originalSetLocal;
    });
  });

  // -----------------------------------------------------------------------
  // Data channel timeout
  // -----------------------------------------------------------------------
  describe('data channel timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects with WEBRTC_FAILED after 10s if no data channel event fires', async () => {
      autoFireDataChannel = false;

      const pc = new WalletCastPeerConnection();
      const answerPromise = pc.createAnswer('remote-offer-sdp');

      // Attach a no-op catch so the rejection is "handled" before
      // advanceTimersByTimeAsync fires the timeout.
      const caught = answerPromise.catch((e: unknown) => e);

      // Advance past both the ICE (5s) and data channel (10s) timeouts
      await vi.advanceTimersByTimeAsync(10000);

      const err = await caught;
      expect(err).toBeInstanceOf(WalletCastError);
      expect((err as WalletCastError).message).toBe('DataChannel timeout');
    });

    it('rejects with correct error code', async () => {
      autoFireDataChannel = false;

      const pc = new WalletCastPeerConnection();
      const answerPromise = pc.createAnswer('remote-offer-sdp');

      const caught = answerPromise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(10000);

      const err = await caught;
      expect(err).toBeInstanceOf(WalletCastError);
      expect((err as WalletCastError).code).toBe(
        WalletCastErrorCode.WEBRTC_FAILED,
      );
    });
  });
});
