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

// ── Install: precache shell assets safely ───────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Ignore non-critical pre-cache fetch failures
          }
        })
      );
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

  // SPA navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/', clone.clone()).catch(() => {});
              cache.put('/index.html', clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => {
            return cached || caches.match('/') || Response.error();
          });
        })
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
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Shell & Static assets: stale-while-revalidate with safe catch handler
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'error') {
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          // If network fetch fails in background, return cached or fallback
          return cached || Response.error();
        });

      return cached || networkPromise;
    })
  );
});

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
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
      sender_username: payload.sender_username,
    },
    tag: isCall ? `call-${payload.caller_id || 'active'}` : `msg-${payload.sender_username || 'chat'}`,
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
