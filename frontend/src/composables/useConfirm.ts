import { ref } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
}

const state = ref<ConfirmState>({
  isOpen: false,
  title: 'تأیید عملیات',
  message: '',
  confirmText: 'تأیید',
  cancelText: 'انصراف',
  variant: 'primary',
});

let resolvePromise: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    if (typeof options === 'string') {
      options = { message: options };
    }

    state.value = {
      isOpen: true,
      title: options.title || 'تأیید عملیات',
      message: options.message,
      confirmText: options.confirmText || 'تأیید',
      cancelText: options.cancelText || 'انصراف',
      variant: options.variant || 'primary',
    };

    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }

  function handleConfirm() {
    state.value.isOpen = false;
    if (resolvePromise) {
      resolvePromise(true);
      resolvePromise = null;
    }
  }

  function handleCancel() {
    state.value.isOpen = false;
    if (resolvePromise) {
      resolvePromise(false);
      resolvePromise = null;
    }
  }

  return {
    state,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
