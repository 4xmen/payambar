import type { WebRTCConfig } from '../types';
import { authHeaders } from './api';

export async function fetchWebRTCConfig(
  apiUrl: string,
  token: string
): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${apiUrl}/webrtc/config`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const data: WebRTCConfig = await res.json();
      return data.iceServers || [];
    }
  } catch (err) {
    console.error('Error fetching WebRTC config:', err);
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export function setupMediaSession(name: string, onHangup: () => void): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: name || 'تماس صوتی',
        artist: 'Payambar',
        album: 'تماس صوتی در حال انجام',
      });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('hangup' as MediaSessionAction, onHangup);
    } catch (e) {
      console.warn('[WebRTC] MediaSession error:', e);
    }
  }
}

export function cleanupMediaSession(): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
    } catch {
      // ignore
    }
  }
}

export async function dismissCallNotification(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const notifications = await reg.getNotifications();
      notifications.forEach((n) => {
        if (n.tag?.startsWith('incoming-call')) {
          n.close();
        }
      });
    }
  } catch {
    // ignore
  }
}
