<script setup lang="ts">
import type { ActiveCall } from '../../types';

defineProps<{
  activeCall: ActiveCall;
  callDuration: string;
  chatListOpen: boolean;
  currentConversationId: number | null;
}>();

const emit = defineEmits<{
  (e: 'return-to-chat'): void;
  (e: 'hangup'): void;
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
