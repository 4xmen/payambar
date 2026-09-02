<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation, Message, PullToRefreshState } from '../../types';
import ChatHeader from './ChatHeader.vue';
import MessagesContainer from './MessagesContainer.vue';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageInputArea from './MessageInputArea.vue';

const messageText = defineModel<string>('messageText', { default: '' });

defineProps<{
  chatListOpen: boolean;
  conversation: Conversation | null;
  currentConversationId: number | null;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasMore: boolean;
  messages: Message[];
  myUserId: number | null;
  messageContextMenu: {
    show: boolean;
    x: number;
    y: number;
    message: Message | null;
  };
  pullToRefresh: PullToRefreshState;
  recordingVoice: boolean;
  recordingElapsedSec: number;
  uploadingFile: boolean;
  sendingVoice: boolean;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'start-call'): void;
  (e: 'load-older'): void;
  (e: 'open-message-menu', event: MouseEvent, msg: Message): void;
  (e: 'close-message-menu'): void;
  (e: 'copy-message', msg: Message): void;
  (e: 'delete-message', msg: Message): void;
  (e: 'send-message'): void;
  (e: 'select-file', file: File): void;
  (e: 'toggle-voice'): void;
  (e: 'messages-scroll', event: Event): void;
  (e: 'pull-start', event: TouchEvent | MouseEvent): void;
  (e: 'pull-move', event: TouchEvent | MouseEvent): void;
  (e: 'pull-end'): void;
}>();

const messagesContainerRef = ref<InstanceType<typeof MessagesContainer> | null>(null);
const inputAreaRef = ref<InstanceType<typeof MessageInputArea> | null>(null);

function scrollToBottom() {
  const el = messagesContainerRef.value?.containerRef;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function focusInput() {
  inputAreaRef.value?.focus();
}

function getContainerEl() {
  return messagesContainerRef.value?.containerRef || null;
}

defineExpose({
  scrollToBottom,
  focusInput,
  getContainerEl,
  messagesContainerRef,
});
</script>

<template>
  <div class="chat-panel" :class="{ 'mobile-hide': chatListOpen }">
    <ChatHeader
      :conversation="conversation"
      :current-conversation-id="currentConversationId"
      @back="emit('back')"
      @call="emit('start-call')"
    />

    <MessagesContainer
      ref="messagesContainerRef"
      :current-conversation-id="currentConversationId"
      :loading-messages="loadingMessages"
      :loading-older-messages="loadingOlderMessages"
      :has-more="hasMore"
      :messages="messages"
      :my-user-id="myUserId"
      :pull-to-refresh="pullToRefresh"
      @load-older="emit('load-older')"
      @open-message-menu="(ev, m) => emit('open-message-menu', ev, m)"
      @scroll="emit('messages-scroll', $event)"
      @pull-start="emit('pull-start', $event)"
      @pull-move="emit('pull-move', $event)"
      @pull-end="emit('pull-end')"
    />

    <MessageContextMenu
      :show="messageContextMenu.show"
      :x="messageContextMenu.x"
      :y="messageContextMenu.y"
      :message="messageContextMenu.message"
      :my-user-id="myUserId"
      @copy="emit('copy-message', $event)"
      @delete="emit('delete-message', $event)"
      @close="emit('close-message-menu')"
    />

    <MessageInputArea
      ref="inputAreaRef"
      :show="Boolean(currentConversationId)"
      v-model:message-text="messageText"
      :recording-voice="recordingVoice"
      :recording-elapsed-sec="recordingElapsedSec"
      :uploading-file="uploadingFile"
      :sending-voice="sendingVoice"
      @send="emit('send-message')"
      @select-file="emit('select-file', $event)"
      @toggle-voice="emit('toggle-voice')"
    />
  </div>
</template>
