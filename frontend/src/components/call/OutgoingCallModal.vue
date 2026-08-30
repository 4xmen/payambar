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
      <div class="call-avatar">
        <img
          v-if="outgoingCall.avatarUrl"
          :src="outgoingCall.avatarUrl"
          class="avatar-img"
          alt="Avatar"
        />
        <span v-else>{{ (outgoingCall.username || '?').charAt(0).toUpperCase() }}</span>
      </div>
      <div class="call-info">
        <h3>{{ outgoingCall.displayName || outgoingCall.username }}</h3>
        <p v-if="outgoingCall.status === 'ringing'">در حال زنگ خوردن...</p>
        <p v-else>در حال برقراری تماس...</p>
      </div>
      <div class="call-actions">
        <button type="button" class="btn-decline" @click="emit('cancel')">
          <span>
            <svg class="icon-svg" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          لغو
        </button>
      </div>
    </div>
  </div>
</template>
