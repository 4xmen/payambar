<script setup lang="ts">
import type { Message } from '../../types';

defineProps<{
  show: boolean;
  x: number;
  y: number;
  message: Message | null;
  myUserId: number | null;
}>();

const emit = defineEmits<{
  (e: 'copy', msg: Message): void;
  (e: 'delete', msg: Message): void;
  (e: 'close'): void;
}>();
</script>

<template>
  <div
    v-if="show && message"
    class="context-menu"
    :style="{ top: `${y}px`, left: `${x}px`, display: 'block', position: 'fixed' }"
  >
    <button type="button" class="context-menu-item copy" @click="emit('copy', message)">
      <span class="context-menu-icon">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      </span>
      <span>کپی پیام</span>
    </button>
    <button
      type="button"
      v-if="Number(message.sender_id) === Number(myUserId)"
      class="context-menu-item delete"
      @click="emit('delete', message)"
    >
      <span class="context-menu-icon">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path
            d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"
          />
        </svg>
      </span>
      <span>حذف پیام</span>
    </button>
  </div>
</template>
