<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { formatRecordingDuration } from '../../services/funcs';

const props = defineProps<{ src: string }>();

const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const current = ref(0);
const duration = ref(0);
const rate = ref(1);
const loading = ref(false);
const failed = ref(false);

const RATES = [1, 1.5, 2];
const progress = computed(() => (duration.value > 0 ? Math.min(100, (current.value / duration.value) * 100) : 0));

function ensureAudio(): HTMLAudioElement {
  if (audio.value) return audio.value;
  const a = new Audio();
  a.preload = 'metadata';
  a.src = props.src;
  a.addEventListener('loadedmetadata', () => {
    // MediaRecorder webm files report Infinity until the end is seeked to.
    if (a.duration === Infinity) {
      a.currentTime = 1e101;
      a.addEventListener(
        'timeupdate',
        () => {
          duration.value = a.duration;
          a.currentTime = 0;
        },
        { once: true }
      );
    } else {
      duration.value = a.duration;
    }
  });
  a.addEventListener('timeupdate', () => {
    if (Number.isFinite(a.duration)) {
      current.value = a.currentTime;
      if (!duration.value) duration.value = a.duration;
    }
  });
  a.addEventListener('playing', () => { playing.value = true; loading.value = false; });
  a.addEventListener('waiting', () => { loading.value = true; });
  a.addEventListener('pause', () => { playing.value = false; });
  a.addEventListener('ended', () => { playing.value = false; current.value = 0; });
  a.addEventListener('error', () => { failed.value = true; playing.value = false; loading.value = false; });
  audio.value = a;
  return a;
}

async function toggle() {
  const a = ensureAudio();
  failed.value = false;
  if (a.paused) {
    // Only one voice message plays at a time.
    document.querySelectorAll('audio').forEach((el) => el.pause());
    window.dispatchEvent(new CustomEvent('voice-play', { detail: a }));
    a.playbackRate = rate.value;
    loading.value = true;
    try {
      await a.play();
    } catch {
      failed.value = true;
      loading.value = false;
    }
  } else {
    a.pause();
  }
}

function onOtherPlay(e: Event) {
  const other = (e as CustomEvent).detail;
  if (other !== audio.value && audio.value && !audio.value.paused) audio.value.pause();
}
window.addEventListener('voice-play', onOtherPlay);

function cycleRate() {
  rate.value = RATES[(RATES.indexOf(rate.value) + 1) % RATES.length];
  if (audio.value) audio.value.playbackRate = rate.value;
}

function seek(e: MouseEvent | KeyboardEvent) {
  const a = ensureAudio();
  if (!duration.value) return;
  if (e instanceof KeyboardEvent) {
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    a.currentTime = Math.max(0, Math.min(duration.value, a.currentTime + step));
    current.value = a.currentTime;
    return;
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  a.currentTime = ratio * duration.value;
  current.value = a.currentTime;
}

onBeforeUnmount(() => {
  window.removeEventListener('voice-play', onOtherPlay);
  audio.value?.pause();
  audio.value = null;
});
</script>

<template>
  <div class="voice-player" dir="ltr" :class="{ failed }">
    <button
      type="button"
      class="vp-play"
      @click="toggle"
      :aria-label="playing ? 'توقف پخش' : 'پخش پیام صوتی'"
    >
      <span v-if="loading" class="inline-spinner" aria-hidden="true"></span>
      <svg v-else-if="playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
      </svg>
    </button>

    <div
      class="vp-track"
      role="slider"
      tabindex="0"
      aria-label="موقعیت پخش"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(duration)"
      :aria-valuenow="Math.round(current)"
      @click="seek"
      @keydown="seek"
    >
      <div class="vp-fill" :style="{ width: progress + '%' }"></div>
      <div class="vp-thumb" :style="{ left: progress + '%' }"></div>
    </div>

    <span class="vp-time">
      {{ failed ? 'خطا' : formatRecordingDuration(playing || current > 0 ? current : duration) }}
    </span>
    <button type="button" class="vp-rate" @click="cycleRate" aria-label="سرعت پخش">{{ rate }}x</button>
  </div>
</template>
