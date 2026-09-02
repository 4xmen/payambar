<script setup lang="ts">
import type { IncomingCall } from '../../types';

defineProps<{
  incomingCall: IncomingCall;
}>();

const emit = defineEmits<{
  (e: 'accept'): void;
  (e: 'reject'): void;
}>();
</script>

<template>
  <div class="modal">
    <div class="modal-content incoming-call-modal">
      <div class="call-avatar-wrapper">
        <div class="call-avatar-pulse pulse-incoming"></div>
        <div class="call-avatar">
          <img
            v-if="incomingCall.avatar_url"
            :src="incomingCall.avatar_url"
            class="avatar-img"
            alt="Avatar"
          />
          <span v-else>{{ (incomingCall.username || '?').charAt(0).toUpperCase() }}</span>
        </div>
      </div>
      <div class="call-info">
        <h3>{{ incomingCall.displayName || incomingCall.username }}</h3>
        <p class="call-status-incoming">
          <span class="status-dot ringing-dot"></span>
          تماس صوتی ورودی...
        </p>
      </div>
      <div class="call-actions">
        <button type="button" class="btn-accept" @click="emit('accept')">
          <span>
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
              />
            </svg>
          </span>
          پذیرفتن
        </button>
        <button type="button" class="btn-decline" @click="emit('reject')">
          <span>
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          رد کردن
        </button>
      </div>
    </div>
  </div>
</template>
