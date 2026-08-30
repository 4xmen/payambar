import { ref } from 'vue';

const toastText = ref('');
const isVisible = ref(false);
let timeoutId: any = null;

export function useToast() {
  function showToast(message: string, duration = 1500) {
    toastText.value = message;
    isVisible.value = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      isVisible.value = false;
      timeoutId = null;
    }, duration);
  }

  return {
    toastText,
    isVisible,
    showToast,
  };
}
