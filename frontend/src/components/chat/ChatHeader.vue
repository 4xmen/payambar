<script setup lang="ts">
import type { Conversation } from '../../types';

defineProps<{
  conversation: Conversation | null;
  currentConversationId: number | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'call'): void;
}>();
</script>

<template>
  <div class="panel-header">
    <div class="chat-header-info">
      <button
        type="button"
        class="icon-btn ghost back-btn mobile-only"
        @click="emit('back')"
        aria-label="بازگشت"
        v-if="currentConversationId"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>

      <span v-if="!currentConversationId" class="select-chat">
        یک مکالمه را انتخاب کنید
      </span>

      <template v-else-if="conversation">
        <div class="chat-header-avatar-wrapper">
          <img
            v-if="conversation.avatar_url"
            :src="conversation.avatar_url"
            class="chat-header-avatar"
            alt="avatar"
          />
          <span v-else class="chat-header-avatar-placeholder">
            {{
              (conversation.display_name || conversation.username || '?')
                .charAt(0)
                .toUpperCase()
            }}
          </span>
          <span v-if="conversation.is_online" class="online-indicator"></span>
        </div>

        <div class="chat-header-text">
          <span class="chat-header-name">
            {{ conversation.display_name || conversation.username }}
          </span>
          <span class="chat-header-status" v-if="conversation.is_online">آنلاین</span>
        </div>
      </template>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="icon-btn ghost call-btn"
        v-if="currentConversationId"
        @click="emit('call')"
        aria-label="تماس صوتی"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
