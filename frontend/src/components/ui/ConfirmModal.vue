<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useConfirm } from '../../composables/useConfirm';

const { state, handleConfirm, handleCancel } = useConfirm();
const dialogRef = ref<HTMLDialogElement | null>(null);
const confirmBtnRef = ref<HTMLButtonElement | null>(null);

watch(
  () => state.value.isOpen,
  (open) => {
    if (open) {
      if (dialogRef.value && !dialogRef.value.open) {
        if (typeof dialogRef.value.showModal === 'function') {
          dialogRef.value.showModal();
        } else {
          dialogRef.value.setAttribute('open', '');
        }
        nextTick(() => {
          confirmBtnRef.value?.focus();
        });
      }
    } else {
      if (dialogRef.value?.open) {
        if (typeof dialogRef.value.close === 'function') {
          dialogRef.value.close();
        } else {
          dialogRef.value.removeAttribute('open');
        }
      }
    }
  }
);

function handleBackdropClick(e: MouseEvent) {
  if (dialogRef.value && e.target === dialogRef.value) {
    handleCancel();
  }
}
</script>

<template>
  <dialog
    id="confirm-modal"
    ref="dialogRef"
    class="modal confirm-modal-dialog"
    aria-labelledby="confirm-modal-title"
    @cancel.prevent="handleCancel"
    @click="handleBackdropClick"
  >
    <div class="confirm-modal-card" tabindex="-1">
      <div class="confirm-modal-header">
        <h3 id="confirm-modal-title" class="confirm-modal-title">
          {{ state.title }}
        </h3>
      </div>
      <div class="confirm-modal-body">
        <p class="confirm-modal-message">{{ state.message }}</p>
      </div>
      <div class="confirm-modal-actions">
        <button
          type="button"
          class="btn-cancel"
          @click="handleCancel"
        >
          {{ state.cancelText }}
        </button>
        <button
          ref="confirmBtnRef"
          type="button"
          :class="state.variant === 'danger' ? 'btn-danger-confirm' : 'btn-primary-confirm'"
          @click="handleConfirm"
        >
          {{ state.confirmText }}
        </button>
      </div>
    </div>
  </dialog>
</template>
