<script setup lang="ts">
import type { Conversation } from '../../types';

defineProps<{
  show: boolean;
  x: number;
  y: number;
  conversation: Conversation | null;
}>();

const emit = defineEmits<{
  (e: 'delete', conv: Conversation): void;
  (e: 'close'): void;
}>();
</script>

<template>
  <div
    v-if="show && conversation"
    class="context-menu"
    :style="{ top: `${y}px`, left: `${x}px`, display: 'block', position: 'fixed' }"
  >
    <button
      type="button"
      class="context-menu-item delete"
      @click="emit('delete', conversation)"
    >
      <span class="context-menu-icon">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path
            d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"
          />
        </svg>
      </span>
      <span>حذف مکالمه</span>
    </button>
  </div>
</template>
