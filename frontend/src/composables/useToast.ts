import { ref } from 'vue';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

const toastText = ref<string>('');
const toastType = ref<ToastType>('info');
const isVisible = ref<boolean>(false);
let timeoutId: any = null;

export function useToast() {
  function showToast(
    message: string,
    typeOrDuration: ToastType | number = 'info',
    duration = 2500
  ) {
    toastText.value = message;
    if (typeof typeOrDuration === 'number') {
      toastType.value = 'info';
      duration = typeOrDuration;
    } else {
      toastType.value = typeOrDuration;
    }
    isVisible.value = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      isVisible.value = false;
      timeoutId = null;
    }, duration);
  }

  function error(message: string, duration = 3000) {
    showToast(message, 'error', duration);
  }

  function success(message: string, duration = 2000) {
    showToast(message, 'success', duration);
  }

  function info(message: string, duration = 2000) {
    showToast(message, 'info', duration);
  }

  function warning(message: string, duration = 3000) {
    showToast(message, 'warning', duration);
  }

  return {
    toastText,
    toastType,
    isVisible,
    showToast,
    error,
    success,
    info,
    warning,
  };
}
