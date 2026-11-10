<script setup lang="ts">
import { ref } from 'vue';
import type { Message } from '../../types';
import VoicePlayer from './VoicePlayer.vue';
import {
  fileExtension,
  isEmojiOnly,
  linkifyText,
  formatTime,
  isAudioMessage,
  isImageMessage,
  isVideoMessage,
  shouldShowMessageStatus,
} from '../../services/funcs';

const imageLoaded = ref(false);
const imageFailed = ref(false);

defineProps<{
  message: Message;
  index: number;
  allMessages: Message[];
  myUserId: number | null;
  isLive?: boolean;
  groupedWithPrev?: boolean;
  groupedWithNext?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-menu', event: MouseEvent, msg: Message): void;
  (e: 'preview-image', url: string): void;
}>();
</script>

<template>
  <div
    class="message"
    :class="[
      Number(message.sender_id) === Number(myUserId) ? 'sent' : 'received',
      {
        'message-live-enter': isLive,
        'group-prev': groupedWithPrev,
        'group-next': groupedWithNext,
        'emoji-only': !message.file_url && isEmojiOnly(message.content),
      },
    ]"
  >
    <div
      class="message-bubble"
      :class="{ 'media-bubble': message.file_url }"
      @contextmenu.prevent="emit('open-menu', $event, message)"
    >
      <template v-if="message.file_url">
        <!-- Image -->
        <template v-if="isImageMessage(message)">
          <div class="media-message image-message">
            <button
              type="button"
              class="message-image-btn"
              @click="message.file_url && emit('preview-image', message.file_url)"
              aria-label="مشاهده تصویر"
            >
              <span v-if="imageFailed" class="image-fallback">تصویر بارگذاری نشد</span>
              <img
                v-else
                :src="message.file_url"
                class="message-image"
                :class="{ loaded: imageLoaded }"
                @load="imageLoaded = true"
                @error="imageFailed = true"
                :alt="message.file_name || 'image'"
                loading="lazy"
              />
            </button>
          </div>
        </template>

        <!-- Video -->
        <template v-else-if="isVideoMessage(message)">
          <div class="media-message video-message">
            <video :src="message.file_url" class="message-video" controls preload="metadata"></video>
          </div>
        </template>

        <!-- Audio -->
        <template v-else-if="isAudioMessage(message)">
          <div class="voice-message">
            <VoicePlayer :src="message.file_url" />
          </div>
        </template>

        <!-- Generic File -->
        <template v-else>
          <a :href="message.file_url" target="_blank" rel="noopener" class="file-link" download>
            <span class="file-ext" aria-hidden="true">{{ fileExtension(message.file_name) }}</span>
            <span class="file-meta">
              <span class="file-name" dir="auto">{{ message.file_name || 'فایل' }}</span>
              <span class="file-action">دانلود</span>
            </span>
          </a>
        </template>
      </template>

      <!-- Text -->
      <template v-else>
        <template v-for="(seg, i) in linkifyText(message.content)" :key="i"
          ><a
            v-if="seg.href"
            :href="seg.href"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="message-link"
            @click.stop
            >{{ seg.text }}</a
          ><template v-else>{{ seg.text }}</template></template
        >
      </template>
    </div>

    <div class="message-footer">
      <div class="message-meta">
        <span
          v-if="shouldShowMessageStatus(message, index, allMessages, myUserId)"
          class="message-status"
          :class="'status-' + message.status"
          :title="message.status === 'read' ? 'خوانده شد' : message.status === 'delivered' ? 'تحویل داده شد' : 'ارسال شد'"
        >
          <svg v-if="message.status === 'read' || message.status === 'delivered'" class="icon-svg" viewBox="0 0 24 24">
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </svg>
          <svg v-else class="icon-svg" viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <span class="message-time">{{ formatTime(message.created_at) }}</span>
      </div>

      <button
        type="button"
        class="message-menu-btn"
        @click.stop="emit('open-menu', $event, message)"
        aria-label="گزینه‌های پیام"
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
