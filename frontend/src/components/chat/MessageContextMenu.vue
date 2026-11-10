<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { Message } from '../../types';

const props = defineProps<{
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

const MENU_W = 200;
const MENU_H = 110;
const pos = computed(() => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  return {
    left: Math.max(8, Math.min(props.x, vw - MENU_W - 8)),
    top: Math.max(8, Math.min(props.y, vh - MENU_H - 8)),
  };
});

function onKey(e: KeyboardEvent) {
  if (props.show && e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div
    v-if="show && message"
    class="context-menu"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px`, display: 'block', position: 'fixed' }"
    role="menu"
  >
    <button type="button" role="menuitem"
      class="context-menu-item copy" @click="emit('copy', message)">
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
      role="menuitem"
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
