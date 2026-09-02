import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';

export interface NetworkStatusOptions {
  onOnline?: () => void;
  onOffline?: () => void;
  onVisible?: () => void;
}

export function useNetworkStatus(options?: NetworkStatusOptions) {
  const isOffline = ref<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  function handleOnline() {
    isOffline.value = false;
    options?.onOnline?.();
  }

  function handleOffline() {
    isOffline.value = true;
    options?.onOffline?.();
  }

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      options?.onVisible?.();
    }
  }

  function setup() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  function cleanup() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  if (getCurrentInstance()) {
    onMounted(setup);
    onBeforeUnmount(cleanup);
  } else {
    setup();
  }

  return {
    isOffline,
    cleanup,
  };
}
