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
  (e: 'cancel-voice'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isDraggingOver = ref<boolean>(false);

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

function onPaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/') || file.size > 0) {
      event.preventDefault();
      emit('select-file', file);
      return;
    }
  }

  const items = event.clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          emit('select-file', file);
          return;
        }
      }
    }
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.types?.includes('Files')) {
    isDraggingOver.value = true;
  }
}

function onDragLeave(event: DragEvent) {
  event.preventDefault();
  isDraggingOver.value = false;
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDraggingOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    emit('select-file', file);
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
  <div
    class="message-input-area"
    :class="{ 'is-dragging': isDraggingOver }"
    v-show="show"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
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
        @paste="onPaste"
        placeholder="پیام..."
      ></textarea>

      <button
        type="button"
        style="direction: ltr;"
        class="icon-btn solid send-btn"
        :disabled="!messageText?.trim()"
        @click="emit('send')"
        aria-label="ارسال"
      >
        <svg class="icon-svg" viewBox="0 0 24 24">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
      </button>
    </div>

    <div v-if="recordingVoice" class="recording-indicator-row">
      <div class="recording-status">
        <span class="recording-pulse-dot"></span>
        <span>در حال ضبط صدا: {{ formatRecordingDuration(recordingElapsedSec) }}</span>
      </div>
      <button
        type="button"
        class="btn-cancel-voice"
        @click="emit('cancel-voice')"
        aria-label="لغو ضبط صدا"
        title="لغو ضبط صدا"
      >
        <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>لغو</span>
      </button>
    </div>
    <div v-if="sendingVoice" class="upload-progress">در حال ارسال پیام صوتی...</div>
    <div v-if="uploadingFile" class="upload-progress">در حال آپلود...</div>
  </div>
</template>
