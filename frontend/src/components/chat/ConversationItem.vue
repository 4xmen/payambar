<script setup lang="ts">
import type { Conversation } from '../../types';
import { formatTime, getConversationPreview } from '../../services/funcs';

defineProps<{
  conversation: Conversation;
  isActive: boolean;
  messagesByUser?: Record<number, any[]>;
}>();

const emit = defineEmits<{
  (e: 'select', conv: Conversation): void;
  (e: 'open-menu', event: MouseEvent, conv: Conversation): void;
}>();
</script>

<template>
  <div
    class="conversation-item"
    :class="{ active: isActive }"
    role="button"
    tabindex="0"
    @click="emit('select', conversation)"
    @keydown.enter.self.prevent="emit('select', conversation)"
    @keydown.space.self.prevent="emit('select', conversation)"
  >
    <div class="conversation-avatar">
      <img
        v-if="conversation.avatar_url"
        :src="conversation.avatar_url"
        alt="آواتار"
        class="avatar-img"
      />
      <span v-else>{{ (conversation.username || '?').charAt(0).toUpperCase() }}</span>
      <span v-if="conversation.is_online" class="online-indicator"></span>
    </div>

    <div class="conversation-info">
      <div class="conversation-username">
        {{ conversation.display_name || conversation.username }}
      </div>
      <div class="conversation-preview">
        {{ getConversationPreview(conversation, messagesByUser) }}
      </div>
    </div>

    <div class="conversation-actions">
      <div class="conversation-time">{{ formatTime(conversation.last_message_at) }}</div>
      <div v-if="conversation.unread_count && conversation.unread_count > 0" class="unread-badge">
        {{ conversation.unread_count }}
      </div>
      <button
        type="button"
        class="conversation-menu-btn"
        @click.stop="emit('open-menu', $event, conversation)"
        aria-label="گزینه‌های مکالمه"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  </div>
</template>
