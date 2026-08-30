import { createApp } from 'vue';
import App from './App.vue';
import '../styles.css';

const app = createApp(App);
app.mount('#app');

// Register Service Worker for PWA
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const sendSkipWaiting = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const watchInstalling = (
    worker: ServiceWorker | null,
    registration: ServiceWorkerRegistration
  ) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && registration.waiting) {
        sendSkipWaiting(registration);
      }
    });
  };

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        console.log('SW registered:', reg.scope);
        sendSkipWaiting(reg);
        watchInstalling(reg.installing, reg);
        reg.addEventListener('updatefound', () => watchInstalling(reg.installing, reg));
      })
      .catch((err) => console.error('SW registration failed:', err));
  });
}
