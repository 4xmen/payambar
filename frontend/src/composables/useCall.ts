import { ref } from 'vue';
import type { ActiveCall, IncomingCall, OutgoingCall } from '../types';
import { API_URL } from '../services/api';
import { formatRecordingDuration } from '../services/funcs';
import {
  cleanupMediaSession,
  dismissCallNotification,
  fetchWebRTCConfig as fetchWebRTCConfigApi,
  setupMediaSession,
} from '../services/webrtc';
import { playRingback, playRingtone, stopAllSounds } from '../services/sound';

const iceServers = ref<RTCIceServer[]>([]);
const localStream = ref<MediaStream | null>(null);
const remoteStream = ref<MediaStream | null>(null);
const peerConnection = ref<RTCPeerConnection | null>(null);
const pendingIceCandidates = ref<RTCIceCandidateInit[]>([]);

const incomingCall = ref<IncomingCall | null>(null);
const outgoingCall = ref<OutgoingCall | null>(null);
const activeCall = ref<ActiveCall | null>(null);
const pendingAutoAnswer = ref<boolean>(false);
const isMuted = ref<boolean>(false);

const callDuration = ref<string>('');
let callTimer: any = null;
let callStartTime: number | null = null;
let wakeLockSentinel: any = null;
let outgoingTimeoutTimer: any = null;
let incomingTimeoutTimer: any = null;

export function useCall() {
  async function loadWebRTCConfig(token: string) {
    iceServers.value = await fetchWebRTCConfigApi(API_URL, token);
  }

  function clearCallTimeouts() {
    if (outgoingTimeoutTimer) {
      clearTimeout(outgoingTimeoutTimer);
      outgoingTimeoutTimer = null;
    }
    if (incomingTimeoutTimer) {
      clearTimeout(incomingTimeoutTimer);
      incomingTimeoutTimer = null;
    }
  }

  function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
      if (!callStartTime) return;
      const now = Date.now();
      const diff = Math.floor((now - callStartTime) / 1000);
      callDuration.value = formatRecordingDuration(diff);
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimer) {
      clearInterval(callTimer);
      callTimer = null;
    }
    callDuration.value = '';
    callStartTime = null;
  }

  async function acquireWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (wakeLockSentinel) {
          await wakeLockSentinel.release().catch(() => {});
        }
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('[WebRTC] Could not acquire screen wake lock:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  function toggleMute(): boolean {
    if (!localStream.value) return false;
    const tracks = localStream.value.getAudioTracks();
    if (tracks.length === 0) return false;
    const nextState = !isMuted.value;
    tracks.forEach((track) => {
      track.enabled = !nextState;
    });
    isMuted.value = nextState;
    return isMuted.value;
  }

  async function flushPendingIceCandidates() {
    if (!peerConnection.value || !peerConnection.value.remoteDescription) return;
    const pending = pendingIceCandidates.value.splice(0);
    for (const candidate of pending) {
      try {
        await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] flush addIceCandidate failed:', err);
      }
    }
  }

  async function handleIncomingIceCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    if (!peerConnection.value || !peerConnection.value.remoteDescription) {
      pendingIceCandidates.value.push(candidate);
      return;
    }
    try {
      await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] addIceCandidate failed:', err);
    }
  }

  function setupPeerConnection(
    otherUserId: number,
    sendWsMessage: (msg: Record<string, unknown>) => void
  ) {
    const pc = new RTCPeerConnection({ iceServers: iceServers.value });
    peerConnection.value = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWsMessage({
          type: 'ice_candidate',
          receiver_id: otherUserId,
          payload: { candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      remoteStream.value =
        event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      let remoteAudio = document.getElementById('remote-audio') as HTMLAudioElement;
      if (!remoteAudio) {
        remoteAudio = document.createElement('audio');
        remoteAudio.id = 'remote-audio';
        remoteAudio.autoplay = true;
        (remoteAudio as any).playsInline = true;
        document.body.appendChild(remoteAudio);
      }
      remoteAudio.srcObject = remoteStream.value;
      remoteAudio.play().catch((err) => console.error('Error playing remote audio:', err));
    };
  }

  async function startCall({
    receiverId,
    username,
    displayName,
    avatarUrl,
    sendWsMessage,
    onSaveCallLog,
  }: {
    receiverId: number;
    username: string;
    displayName?: string;
    avatarUrl?: string | null;
    sendWsMessage: (msg: Record<string, unknown>) => void;
    onSaveCallLog?: (otherUserId: number, text: string) => void;
  }) {
    if (activeCall.value || outgoingCall.value || incomingCall.value) return;

    clearCallTimeouts();
    isMuted.value = false;

    outgoingCall.value = {
      receiver_id: receiverId,
      username,
      displayName,
      avatarUrl,
      status: 'calling',
    };

    // Auto-cancel after 40s if no answer
    outgoingTimeoutTimer = setTimeout(() => {
      if (outgoingCall.value) {
        endCall({
          isInitiator: true,
          sendWsMessage,
          onSaveCallLog,
        });
      }
    }, 40000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.value = stream;
      await acquireWakeLock();
      setupPeerConnection(receiverId, sendWsMessage);

      stream.getTracks().forEach((track) => {
        peerConnection.value?.addTrack(track, stream);
      });

      const offer = await peerConnection.value!.createOffer();
      await peerConnection.value!.setLocalDescription(offer);

      sendWsMessage({
        type: 'call_offer',
        receiver_id: receiverId,
        payload: { offer },
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      alert('خطا در دسترسی به میکروفون');
      endCall({ isInitiator: false, sendWsMessage, onSaveCallLog });
    }
  }

  function handleCallRinging() {
    if (outgoingCall.value) {
      outgoingCall.value.status = 'ringing';
      playRingback();
    }
  }

  function setIncomingCall(callData: IncomingCall) {
    clearCallTimeouts();
    incomingCall.value = callData;
    playRingtone();

    // Auto-dismiss after 45s if unanswered
    incomingTimeoutTimer = setTimeout(() => {
      if (incomingCall.value) {
        stopAllSounds();
        dismissCallNotification();
        incomingCall.value = null;
      }
    }, 45000);
  }

  async function acceptCall(sendWsMessage: (msg: Record<string, unknown>) => void) {
    if (!incomingCall.value) return;
    clearCallTimeouts();
    stopAllSounds();
    isMuted.value = false;

    const senderId = Number(incomingCall.value.sender_id);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.value = stream;
      await acquireWakeLock();
      setupPeerConnection(senderId, sendWsMessage);

      stream.getTracks().forEach((track) => {
        peerConnection.value?.addTrack(track, stream);
      });

      await peerConnection.value!.setRemoteDescription(
        new RTCSessionDescription(incomingCall.value.offer)
      );
      await flushPendingIceCandidates();
      const answer = await peerConnection.value!.createAnswer();
      await peerConnection.value!.setLocalDescription(answer);

      sendWsMessage({
        type: 'call_answer',
        receiver_id: senderId,
        payload: { answer },
      });

      activeCall.value = {
        user_id: senderId,
        username: incomingCall.value.username,
        displayName: incomingCall.value.displayName,
        avatar_url: incomingCall.value.avatar_url,
      };

      setupMediaSession(activeCall.value.displayName || activeCall.value.username, () => {
        endCall({ isInitiator: true, sendWsMessage });
      });

      await dismissCallNotification();
      incomingCall.value = null;
      startCallTimer();
    } catch (err) {
      console.error('Failed to accept call:', err);
      alert('خطا در دسترسی به میکروفون');
      rejectCall(sendWsMessage);
    }
  }

  function rejectCall(
    sendWsMessage: (msg: Record<string, unknown>) => void,
    onSaveCallLog?: (otherUserId: number, text: string) => void
  ) {
    clearCallTimeouts();
    stopAllSounds();
    dismissCallNotification();
    if (!incomingCall.value) return;
    sendWsMessage({
      type: 'call_reject',
      receiver_id: Number(incomingCall.value.sender_id),
    });
    onSaveCallLog?.(incomingCall.value.sender_id, 'تماس ناموفق');
    pendingIceCandidates.value = [];
    incomingCall.value = null;
  }

  function endCall({
    isInitiator = true,
    sendWsMessage,
    onSaveCallLog,
  }: {
    isInitiator?: boolean;
    sendWsMessage?: (msg: Record<string, unknown>) => void;
    onSaveCallLog?: (otherUserId: number, text: string) => void;
  }) {
    clearCallTimeouts();
    stopAllSounds();
    releaseWakeLock();
    cleanupMediaSession();
    dismissCallNotification();
    isMuted.value = false;

    if (activeCall.value) {
      if (isInitiator && sendWsMessage) {
        sendWsMessage({
          type: 'call_hangup',
          receiver_id: Number(activeCall.value.user_id),
        });
        const durationText = callDuration.value ? ` (${callDuration.value})` : '';
        onSaveCallLog?.(activeCall.value.user_id, `تماس صوتی${durationText}`);
      }
    } else if (outgoingCall.value) {
      if (isInitiator && sendWsMessage) {
        sendWsMessage({
          type: 'call_hangup',
          receiver_id: Number(outgoingCall.value.receiver_id),
        });
        onSaveCallLog?.(outgoingCall.value.receiver_id, 'تماس ناموفق');
      }
    }

    if (peerConnection.value) {
      peerConnection.value.close();
      peerConnection.value = null;
    }
    if (localStream.value) {
      localStream.value.getTracks().forEach((t) => t.stop());
      localStream.value = null;
    }

    const remoteAudio = document.getElementById('remote-audio') as HTMLAudioElement;
    if (remoteAudio) {
      remoteAudio.srcObject = null;
    }

    pendingIceCandidates.value = [];
    stopCallTimer();
    activeCall.value = null;
    outgoingCall.value = null;
    incomingCall.value = null;
  }

  async function handleCallAnswer(answer: RTCSessionDescriptionInit) {
    if (!outgoingCall.value || !peerConnection.value) return;
    clearCallTimeouts();
    stopAllSounds();
    try {
      await peerConnection.value.setRemoteDescription(new RTCSessionDescription(answer));
      await flushPendingIceCandidates();
      activeCall.value = {
        user_id: Number(outgoingCall.value.receiver_id),
        username: outgoingCall.value.username,
        displayName: outgoingCall.value.displayName,
        avatar_url: outgoingCall.value.avatarUrl,
      };
      outgoingCall.value = null;
      startCallTimer();
      acquireWakeLock();
      setupMediaSession(activeCall.value.displayName || activeCall.value.username, () => {
        endCall({ isInitiator: true });
      });
      await dismissCallNotification();
    } catch (err) {
      console.error('[WebRTC] Error handling call_answer:', err);
    }
  }

  return {
    iceServers,
    incomingCall,
    outgoingCall,
    activeCall,
    pendingAutoAnswer,
    callDuration,
    isMuted,
    loadWebRTCConfig,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    handleCallAnswer,
    handleCallRinging,
    setIncomingCall,
    toggleMute,
    handleIncomingIceCandidate,
    flushPendingIceCandidates,
  };
}
