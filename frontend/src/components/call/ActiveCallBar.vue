<script setup lang="ts">
import type { ActiveCall } from '../../types';

defineProps<{
  activeCall: ActiveCall;
  callDuration: string;
  chatListOpen: boolean;
  currentConversationId: number | null;
  isMuted?: boolean;
}>();

const emit = defineEmits<{
  (e: 'return-to-chat'): void;
  (e: 'hangup'): void;
  (e: 'toggle-mute'): void;
}>();
</script>

<template>
  <div class="active-call-bar" @click="emit('return-to-chat')">
    <div class="active-call-info">
      <span class="pulse-icon">●</span>
      <span class="active-call-title">
        در حال مکالمه با {{ activeCall.displayName || activeCall.username }}
      </span>
      <span v-if="callDuration" class="call-timer-badge">{{ callDuration }}</span>
    </div>
    <div class="active-call-actions">
      <button
        type="button"
        class="btn-mute-call"
        :class="{ 'is-muted': isMuted }"
        :title="isMuted ? 'فعال‌سازی میکروفون (بی‌صدا)' : 'قطع میکروفون'"
        :aria-label="isMuted ? 'فعال‌سازی میکروفون' : 'قطع میکروفون'"
        @click.stop="emit('toggle-mute')"
      >
        <svg v-if="isMuted" class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <svg v-else class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      <button
        type="button"
        class="btn-return-call"
        v-if="chatListOpen || Number(currentConversationId) !== Number(activeCall.user_id)"
        @click.stop="emit('return-to-chat')"
      >
        بازگشت به چت
      </button>
      <button type="button" class="btn-hangup" @click.stop="emit('hangup')">
        قطع تماس
      </button>
    </div>
  </div>
</template>
