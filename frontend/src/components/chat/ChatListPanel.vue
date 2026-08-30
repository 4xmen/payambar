<script setup lang="ts">
import type { Conversation, SearchUser } from '../../types';
import UserProfileBar from './UserProfileBar.vue';
import ConversationItem from './ConversationItem.vue';
import ConversationContextMenu from './ConversationContextMenu.vue';
import NewChatModal from './NewChatModal.vue';

defineProps<{
  chatListOpen: boolean;
  avatarUrl: string | null;
  username: string | null;
  displayName: string;
  statusText: string;
  loadingConversations: boolean;
  filteredConversations: Conversation[];
  currentConversationId: number | null;
  messagesByUser?: Record<number, any[]>;
  conversationMenu: {
    show: boolean;
    x: number;
    y: number;
    conversation: Conversation | null;
  };
  showNewChatModal: boolean;
  token: string | null;
}>();

const emit = defineEmits<{
  (e: 'open-profile'): void;
  (e: 'select-conversation', conv: Conversation): void;
  (e: 'open-conversation-menu', event: MouseEvent, conv: Conversation): void;
  (e: 'delete-conversation', conv: Conversation): void;
  (e: 'close-conversation-menu'): void;
  (e: 'open-new-chat'): void;
  (e: 'close-new-chat'): void;
  (e: 'select-new-chat-user', user: SearchUser): void;
}>();
</script>

<template>
  <div class="chat-list-panel" :class="{ 'mobile-show': chatListOpen }">
    <!-- User Profile Section -->
    <UserProfileBar
      :avatar-url="avatarUrl"
      :username="username"
      :display-name="displayName"
      :status-text="statusText"
      @open-profile="emit('open-profile')"
    />

    <!-- Conversations List -->
    <div class="conversations-list">
      <div v-if="loadingConversations" class="conversation-skeleton-list">
        <div
          v-for="n in 6"
          :key="'skeleton-' + n"
          class="conversation-item skeleton"
        >
          <div class="conversation-avatar skeleton-avatar"></div>
          <div class="conversation-info">
            <div class="skeleton-line skeleton-name"></div>
          </div>
        </div>
      </div>

      <div v-else-if="filteredConversations.length === 0" class="empty-state">
        هیچ مکالمه‌ای نیست
      </div>

      <ConversationItem
        v-else
        v-for="conv in filteredConversations"
        :key="conv.id"
        :conversation="conv"
        :is-active="conv.user_id === currentConversationId"
        :messages-by-user="messagesByUser"
        @select="emit('select-conversation', $event)"
        @open-menu="emit('open-conversation-menu', $event, conv)"
      />
    </div>

    <!-- Floating Action Button -->
    <button
      type="button"
      class="fab-new-chat"
      @click="emit('open-new-chat')"
      aria-label="مکالمه جدید"
      title="مکالمه جدید"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>

    <!-- Conversation Menu -->
    <ConversationContextMenu
      :show="conversationMenu.show"
      :x="conversationMenu.x"
      :y="conversationMenu.y"
      :conversation="conversationMenu.conversation"
      @delete="emit('delete-conversation', $event)"
      @close="emit('close-conversation-menu')"
    />

    <!-- New Chat Modal -->
    <NewChatModal
      :is-open="showNewChatModal"
      :token="token"
      @close="emit('close-new-chat')"
      @select-user="emit('select-new-chat-user', $event)"
    />
  </div>
</template>
