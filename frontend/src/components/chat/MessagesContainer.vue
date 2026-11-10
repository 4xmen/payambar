<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Message, PullToRefreshState } from '../../types';
import MessageItem from './MessageItem.vue';
import { dayKey, formatDayLabel } from '../../services/funcs';

const props = defineProps<{
  currentConversationId: number | null;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasMore: boolean;
  messages: Message[];
  myUserId: number | null;
  pullToRefresh: PullToRefreshState;
}>();

const emit = defineEmits<{
  (e: 'load-older'): void;
  (e: 'open-message-menu', event: MouseEvent, msg: Message): void;
  (e: 'refresh'): void;
  (e: 'scroll', event: Event): void;
  (e: 'pull-start', event: TouchEvent | MouseEvent): void;
  (e: 'pull-move', event: TouchEvent | MouseEvent): void;
  (e: 'pull-end'): void;
  (e: 'preview-image', url: string): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);

const knownMessageIds = ref<Set<string | number>>(new Set());
const liveMessageIds = ref<Set<string | number>>(new Set());
const isInitialLoadDone = ref<boolean>(false);

function getMsgKey(msg: Message): string | number {
  return msg.client_message_id || msg.id || '';
}

function isLiveMessage(msg: Message): boolean {
  const key = getMsgKey(msg);
  return Boolean(key && liveMessageIds.value.has(key));
}

watch(
  () => props.currentConversationId,
  () => {
    knownMessageIds.value.clear();
    liveMessageIds.value.clear();
    isInitialLoadDone.value = false;
  }
);

watch(
  () => props.loadingMessages,
  (loading) => {
    if (!loading && !isInitialLoadDone.value && props.currentConversationId) {
      for (const m of props.messages) {
        const key = getMsgKey(m);
        if (key) knownMessageIds.value.add(key);
      }
      isInitialLoadDone.value = true;
    }
  }
);

watch(
  () => props.messages,
  (newMsgs) => {
    if (!props.currentConversationId) return;

    if (!isInitialLoadDone.value) {
      if (!props.loadingMessages) {
        for (const m of newMsgs) {
          const key = getMsgKey(m);
          if (key) knownMessageIds.value.add(key);
        }
        if (newMsgs.length > 0) {
          isInitialLoadDone.value = true;
        }
      }
      return;
    }

    if (props.loadingOlderMessages) {
      for (const m of newMsgs) {
        const key = getMsgKey(m);
        if (key) knownMessageIds.value.add(key);
      }
      return;
    }

    for (const m of newMsgs) {
      const key = getMsgKey(m);
      if (key && !knownMessageIds.value.has(key)) {
        knownMessageIds.value.add(key);
        liveMessageIds.value.add(key);
        setTimeout(() => {
          liveMessageIds.value.delete(key);
        }, 1000);
      }
    }
  },
  { deep: false, immediate: true }
);

function showDaySeparator(index: number): boolean {
  const cur = dayKey(props.messages[index]?.created_at);
  if (!cur) return false;
  return index === 0 || dayKey(props.messages[index - 1]?.created_at) !== cur;
}

function sameGroup(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b) return false;
  if (Number(a.sender_id) !== Number(b.sender_id)) return false;
  const da = dayKey(a.created_at);
  return da === dayKey(b.created_at) &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60 * 1000;
}

function handleScroll(event: Event) {
  emit('scroll', event);
  const container = event.target as HTMLElement;
  if (
    container &&
    container.scrollTop < 120 &&
    !props.loadingOlderMessages &&
    !props.loadingMessages &&
    props.hasMore &&
    props.currentConversationId
  ) {
    emit('load-older');
  }
}

defineExpose({
  containerRef,
});
</script>

<template>
  <div
    ref="containerRef"
    class="messages-container"
    @scroll="handleScroll"
    @touchstart="emit('pull-start', $event)"
    @touchmove="emit('pull-move', $event)"
    @touchend="emit('pull-end')"
  >
    <div v-if="!currentConversationId" class="desktop-empty-state">
      <div class="desktop-empty-badge">💬</div>
      <h3 class="desktop-empty-title">پیام‌رسان پیامبر</h3>
      <p class="desktop-empty-desc">برای شروع چت، یک مکالمه را از فهرست انتخاب کنید یا با دکمه + مکالمه جدید بسازید.</p>
    </div>
    <div v-else-if="loadingMessages" class="messages-skeleton" role="status" aria-label="در حال بارگذاری پیام‌ها">
      <div v-for="n in 5" :key="n" class="skeleton-bubble" :class="n % 2 ? 'sent' : 'received'" :style="{ width: 30 + ((n * 17) % 35) + '%' }"></div>
    </div>
    <div v-else-if="messages.length === 0" class="empty-state empty-chat">
      <div class="empty-chat-icon" aria-hidden="true">👋</div>
      <strong>هنوز پیامی وجود ندارد</strong>
      <span>اولین پیام را بفرستید و گفتگو را شروع کنید.</span>
    </div>
    <div v-else>
      <div v-if="loadingOlderMessages" class="loading-older">
        در حال بارگذاری پیام‌های قدیمی‌تر...
      </div>
      <div
        v-if="hasMore && !loadingOlderMessages"
        class="load-more-hint"
        @click="emit('load-older')"
      >
        برای بارگذاری پیام‌های قدیمی‌تر به بالا اسکرول کنید
      </div>
      <template
        v-for="(msg, index) in messages"
        :key="msg.client_message_id || msg.id || index"
      >
      <div v-if="showDaySeparator(index)" class="day-separator" role="separator">
        <span>{{ formatDayLabel(msg.created_at) }}</span>
      </div>
      <MessageItem
        :message="msg"
        :index="index"
        :all-messages="messages"
        :my-user-id="myUserId"
        :is-live="isLiveMessage(msg)"
        :grouped-with-prev="!showDaySeparator(index) && sameGroup(messages[index - 1], msg)"
        :grouped-with-next="index + 1 < messages.length && !showDaySeparator(index + 1) && sameGroup(msg, messages[index + 1])"
        @open-menu="(ev, m) => emit('open-message-menu', ev, m)"
        @preview-image="(url) => emit('preview-image', url)"
      />
      </template>
    </div>
  </div>

  <!-- Pull to refresh indicator -->
  <div
    v-if="currentConversationId"
    class="pull-to-refresh-indicator"
    :class="{
      visible: pullToRefresh.pulling || pullToRefresh.refreshing,
      ready: pullToRefresh.currentY >= pullToRefresh.threshold,
    }"
    :style="
      pullToRefresh.pulling || pullToRefresh.refreshing
        ? { transform: `translateY(-${pullToRefresh.currentY}px)` }
        : undefined
    "
  >
    <div v-if="pullToRefresh.refreshing" class="refresh-spinner">
      <svg class="icon-svg" viewBox="0 0 24 24">
        <path
          d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"
        />
      </svg>
    </div>
    <div
      v-else-if="pullToRefresh.currentY >= pullToRefresh.threshold"
      class="refresh-hint"
    >
      رها کنید
    </div>
    <div v-else class="refresh-hint">برای بروزرسانی به بالا بکشید</div>
  </div>
</template>
