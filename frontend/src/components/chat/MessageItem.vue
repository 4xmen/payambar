<script setup lang="ts">
import type { Message } from '../../types';
import {
  formatDate,
  formatTime,
  isAudioMessage,
  isImageMessage,
  isVideoMessage,
  shouldShowMessageStatus,
} from '../../services/funcs';

defineProps<{
  message: Message;
  index: number;
  allMessages: Message[];
  myUserId: number | null;
}>();

const emit = defineEmits<{
  (e: 'open-menu', event: MouseEvent, msg: Message): void;
}>();
</script>

<template>
  <div
    class="message"
    :class="Number(message.sender_id) === Number(myUserId) ? 'sent' : 'received'"
  >
    <div class="message-bubble" :class="{ 'media-bubble': message.file_url }">
      <template v-if="message.file_url">
        <!-- Image -->
        <template v-if="isImageMessage(message)">
          <div class="media-message image-message">
            <a :href="message.file_url" target="_blank" class="message-image-link">
              <img
                :src="message.file_url"
                class="message-image"
                :alt="message.file_name || 'image'"
              />
            </a>
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
            <audio :src="message.file_url" controls preload="metadata"></audio>
          </div>
        </template>

        <!-- Generic File -->
        <template v-else>
          <a :href="message.file_url" target="_blank" class="file-link" download>
            <svg class="icon-svg" viewBox="0 0 24 24">
              <path
                d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              />
            </svg>
            {{ message.file_name || 'دانلود فایل' }}
          </a>
        </template>
      </template>

      <!-- Text -->
      <template v-else>{{ message.content }}</template>
    </div>

    <div class="message-footer">
      <div class="message-meta">
        <span
          v-if="shouldShowMessageStatus(message, index, allMessages, myUserId)"
          class="message-status"
        >
          <svg v-if="message.status === 'read'" class="icon-svg" viewBox="0 0 24 24">
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </svg>
          <svg v-else-if="message.status === 'delivered'" class="icon-svg" viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <span class="message-time">{{ formatTime(message.created_at) }}</span>
        <span class="message-date" v-if="formatDate(message.created_at)">
          &nbsp;{{ formatDate(message.created_at) }}
        </span>
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
