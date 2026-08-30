import { authHeaders } from './api';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

export async function subscribePush(apiUrl: string, token: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications not supported');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  // Get VAPID public key from server
  const vapidRes = await fetch(`${apiUrl}/push/vapid-key`);
  if (!vapidRes.ok) throw new Error('Push not configured on server');
  const { vapid_public_key } = await vapidRes.json();

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid_public_key) as BufferSource,
  });

  const subJSON = subscription.toJSON();
  const res = await fetch(`${apiUrl}/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      endpoint: subJSON.endpoint,
      keys: {
        p256dh: subJSON.keys?.p256dh,
        auth: subJSON.keys?.auth,
      },
    }),
  });
  if (!res.ok) throw new Error('Server rejected subscription');
}

export async function unsubscribePush(apiUrl: string, token: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const subJSON = subscription.toJSON();
      await fetch(`${apiUrl}/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({ endpoint: subJSON.endpoint }),
      });
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.warn('Unsubscribe error:', err);
  }
}
