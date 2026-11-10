<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { Conversation } from '../../types';

const props = defineProps<{
  show: boolean;
  x: number;
  y: number;
  conversation: Conversation | null;
}>();

const emit = defineEmits<{
  (e: 'mark-read', conv: Conversation): void;
  (e: 'delete', conv: Conversation): void;
  (e: 'close'): void;
}>();

const MENU_W = 260;
const MENU_H = 120;
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
    v-if="show && conversation"
    class="context-menu"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px`, display: 'block', position: 'fixed' }"
    role="menu"
  >
    <button
      type="button"
      role="menuitem"
      class="context-menu-item"
      :disabled="!conversation.unread_count"
      @click="emit('mark-read', conversation)"
    >
      <span class="context-menu-icon">
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="M18 6 7 17l-5-5" />
          <path d="m22 10-7.5 7.5L13 16" />
        </svg>
      </span>
      <span>علامت‌گذاری همه به‌عنوان خوانده‌شده</span>
    </button>
    <button
      type="button"
      role="menuitem"
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
