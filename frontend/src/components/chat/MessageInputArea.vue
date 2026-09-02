<script setup lang="ts">
import { ref } from 'vue';
import { formatRecordingDuration } from '../../services/funcs';

const messageText = defineModel<string>('messageText', { default: '' });

defineProps<{
  show: boolean;
  recordingVoice: boolean;
  recordingElapsedSec: number;
  uploadingFile: boolean;
  sendingVoice: boolean;
}>();

const emit = defineEmits<{
  (e: 'send'): void;
  (e: 'select-file', file: File): void;
  (e: 'toggle-voice'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function resizeTextarea() {
  const input = textareaRef.value;
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    emit('send');
  }
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    emit('select-file', file);
    target.value = '';
  }
}

function focus() {
  textareaRef.value?.focus();
}

defineExpose({
  focus,
  resizeTextarea,
});
</script>

<template>
  <div class="message-input-area" v-show="show">
    <div class="input-container">
      <input
        type="file"
        ref="fileInputRef"
        @change="onFileChange"
        style="display: none;"
      />
      <button
        type="button"
        class="icon-btn ghost"
        @click="fileInputRef?.click()"
        aria-label="پیوست فایل"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path
            d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
          />
        </svg>
      </button>

      <button
        type="button"
        class="icon-btn ghost"
        :class="{ recording: recordingVoice }"
        @click="emit('toggle-voice')"
        :disabled="uploadingFile || sendingVoice"
        :aria-label="recordingVoice ? 'توقف ضبط' : 'ضبط صدا'"
        :title="recordingVoice ? 'توقف ضبط و ارسال' : 'ضبط پیام صوتی'"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
      </button>

      <textarea
        ref="textareaRef"
        rows="1"
        v-model="messageText"
        @input="resizeTextarea"
        @keydown="onKeydown"
        placeholder="پیام..."
      ></textarea>

      <button
        type="button"
        style="direction: ltr;"
        class="icon-btn solid send-btn"
        @click="emit('send')"
        aria-label="ارسال"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
      </button>
    </div>

    <div v-if="recordingVoice" class="recording-indicator">
      در حال ضبط صدا: {{ formatRecordingDuration(recordingElapsedSec) }}
    </div>
    <div v-if="sendingVoice" class="upload-progress">در حال ارسال پیام صوتی...</div>
    <div v-if="uploadingFile" class="upload-progress">در حال آپلود...</div>
  </div>
</template>
