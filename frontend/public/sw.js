// Service Worker for offline support and caching
const BUILD_HASH = '__BUILD_HASH__';
const CACHE_NAME = `payambar-${BUILD_HASH}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-192.png',
  '/favicon-512.png',
  '/fonts/vazirmatn-arabic.woff2',
  '/fonts/vazirmatn-latin.woff2',
];

// ── Install: precache shell assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        console.warn('Some resources could not be cached');
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ── Messages from the page ─────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch strategy ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/', clone.clone());
              cache.put('/index.html', clone);
            });
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // API calls: network-first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Shell & Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type !== 'error') {
            cache.put(event.request, response.clone());
          }
          return response;
        });
        return cached || networkFetch;
      });
    })
  );
});

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'پیام جدید', body: event.data.text() || 'پیام جدید دارید' };
  }

  const isCall = payload.type === 'incoming_call';
  const title = payload.title || (isCall ? '📞 تماس صوتی ورودی' : 'پیام جدید');
  const callerName = payload.caller_username || payload.body || 'تماس صوتی';

  const options = {
    body: isCall ? `تماس از طرف ${callerName}` : (payload.body || 'پیام جدید دارید'),
    icon: '/favicon-192.png',
    badge: '/favicon-96.png',
    data: {
      url: payload.url || (isCall ? `/?call_from=${payload.caller_id || ''}` : '/'),
      type: payload.type || 'message',
      caller_id: payload.caller_id,
    },
    tag: isCall ? `incoming-call-${payload.caller_id || 'active'}` : 'new-message',
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [300, 200, 300, 200, 500, 200, 500] : [100, 50, 100],
    actions: isCall
      ? [
          { action: 'answer', title: '📞 پاسخ' },
          { action: 'decline', title: '✖ رد' },
        ]
      : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'decline') {
    return;
  }

  const isAnswerAction = event.action === 'answer';
  let rawUrl = event.notification.data?.url || '/';
  if (isAnswerAction) {
    rawUrl = rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'auto_answer=1';
  }
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && client.url.includes(self.location.origin) && 'focus' in client) {
          if (isAnswerAction) {
            client.postMessage({
              type: 'auto_answer',
              caller_id: event.notification.data?.caller_id,
            });
          }
          if ('navigate' in client && targetUrl !== client.url) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
