<script setup lang="ts">
import type { OutgoingCall } from '../../types';

defineProps<{
  outgoingCall: OutgoingCall;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
}>();
</script>

<template>
  <div class="modal">
    <div class="modal-content incoming-call-modal">
      <div class="call-avatar-wrapper">
        <div class="call-avatar-pulse" :class="{ 'pulse-active': outgoingCall.status === 'ringing' }"></div>
        <div class="call-avatar">
          <img
            v-if="outgoingCall.avatarUrl"
            :src="outgoingCall.avatarUrl"
            class="avatar-img"
            alt="Avatar"
          />
          <span v-else>{{ (outgoingCall.username || '?').charAt(0).toUpperCase() }}</span>
        </div>
      </div>
      <div class="call-info">
        <h3>{{ outgoingCall.displayName || outgoingCall.username }}</h3>
        <p v-if="outgoingCall.status === 'ringing'" class="call-status-ringing">
          <span class="status-dot ringing-dot"></span>
          در حال زنگ خوردن...
        </p>
        <p v-else class="call-status-calling">
          <span class="status-dot calling-dot"></span>
          در حال برقراری ارتباط...
        </p>
      </div>
      <div class="call-actions">
        <button type="button" class="btn-decline" @click="emit('cancel')">
          <span>
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          لغو تماس
        </button>
      </div>
    </div>
  </div>
</template>
