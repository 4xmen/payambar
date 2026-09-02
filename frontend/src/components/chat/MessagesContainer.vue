<script setup lang="ts">
import { ref } from 'vue';
import type { Message, PullToRefreshState } from '../../types';
import MessageItem from './MessageItem.vue';

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
}>();

const containerRef = ref<HTMLDivElement | null>(null);

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
    <div v-if="!currentConversationId" class="empty-state">
      یک مکالمه را انتخاب کنید
    </div>
    <div v-else-if="loadingMessages" class="empty-state">
      در حال بارگذاری...
    </div>
    <div v-else-if="messages.length === 0" class="empty-state">
      هنوز پیامی وجود ندارد
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
      <MessageItem
        v-for="(msg, index) in messages"
        :key="msg.id || msg.client_message_id || index"
        :message="msg"
        :index="index"
        :all-messages="messages"
        :my-user-id="myUserId"
        @open-menu="(ev, m) => emit('open-message-menu', ev, m)"
      />
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
