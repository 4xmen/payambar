<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Conversation, Message, PullToRefreshState } from '../../types';
import ChatHeader from './ChatHeader.vue';
import MessagesContainer from './MessagesContainer.vue';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageInputArea from './MessageInputArea.vue';

const messageText = defineModel<string>('messageText', { default: '' });

const props = defineProps<{
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
  (e: 'cancel-voice'): void;
  (e: 'messages-scroll', event: Event): void;
  (e: 'pull-start', event: TouchEvent | MouseEvent): void;
  (e: 'pull-move', event: TouchEvent | MouseEvent): void;
  (e: 'pull-end'): void;
}>();

const messagesContainerRef = ref<InstanceType<typeof MessagesContainer> | null>(null);
const inputAreaRef = ref<InstanceType<typeof MessageInputArea> | null>(null);
const showScrollBottom = ref<boolean>(false);
const unreadBelowCount = ref<number>(0);
const previewImageUrl = ref<string | null>(null);

function closeImagePreview() {
  previewImageUrl.value = null;
}

watch(previewImageUrl, (newVal) => {
  if (newVal) {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeImagePreview();
        window.removeEventListener('keydown', onKeydown);
      }
    };
    window.addEventListener('keydown', onKeydown);
  }
});

function scrollToBottom() {
  const el = messagesContainerRef.value?.containerRef;
  if (el) {
    el.scrollTop = el.scrollHeight;
    showScrollBottom.value = false;
    unreadBelowCount.value = 0;
  }
}

function scrollToBottomSmooth() {
  const el = messagesContainerRef.value?.containerRef;
  if (el) {
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
    showScrollBottom.value = false;
    unreadBelowCount.value = 0;
  }
}

function handleMessagesScroll(event: Event) {
  emit('messages-scroll', event);
  const container = event.target as HTMLElement;
  if (container) {
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    showScrollBottom.value = distanceToBottom > 220;
    if (!showScrollBottom.value) {
      unreadBelowCount.value = 0;
    }
  }
}

watch(
  () => props.currentConversationId,
  () => {
    showScrollBottom.value = false;
    unreadBelowCount.value = 0;
  }
);

watch(
  () => props.messages.length,
  (newLen, oldLen) => {
    if (showScrollBottom.value && newLen > oldLen) {
      unreadBelowCount.value += (newLen - oldLen);
    }
  }
);

function focusInput() {
  inputAreaRef.value?.focus();
}

function getContainerEl() {
  return messagesContainerRef.value?.containerRef || null;
}

defineExpose({
  scrollToBottom,
  scrollToBottomSmooth,
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
      @scroll="handleMessagesScroll"
      @pull-start="emit('pull-start', $event)"
      @pull-move="emit('pull-move', $event)"
      @pull-end="emit('pull-end')"
      @preview-image="(url) => previewImageUrl = url"
    />

    <!-- Floating Scroll to Bottom Button -->
    <transition name="fade-slide">
      <button
        v-if="showScrollBottom && currentConversationId"
        type="button"
        class="btn-scroll-bottom"
        @click="scrollToBottomSmooth"
        aria-label="اسکرول به جدیدترین پیام‌ها"
        title="اسکرول به آخرین پیام"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="m19 12-7 7-7-7" />
          <path d="M12 5v14" />
        </svg>
        <span v-if="unreadBelowCount > 0" class="scroll-unread-badge">
          {{ unreadBelowCount > 99 ? '99+' : unreadBelowCount }}
        </span>
      </button>
    </transition>

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
      @cancel-voice="emit('cancel-voice')"
    />

    <!-- In-App Image Viewer / Lightbox -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="previewImageUrl"
          class="image-lightbox-overlay"
          @click.self="closeImagePreview"
          aria-modal="true"
          role="dialog"
        >
          <div class="image-lightbox-content">
            <div class="image-lightbox-actions">
              <a
                :href="previewImageUrl"
                target="_blank"
                download
                class="lightbox-btn"
                title="دانلود تصویر"
                aria-label="دانلود تصویر"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
              <button
                type="button"
                class="lightbox-btn"
                @click="closeImagePreview"
                title="بستن"
                aria-label="بستن پیش‌نمایش"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <img :src="previewImageUrl" class="image-lightbox-img" alt="پیش‌نمایش تصویر" />
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
