<script setup lang="ts">
import { useTheme } from '../../composables/useTheme';

defineProps<{
  avatarUrl: string | null;
  username: string | null;
  displayName: string;
  statusText: string;
}>();

const emit = defineEmits<{
  (e: 'open-profile'): void;
}>();

const { isDark, toggleTheme } = useTheme();
</script>

<template>
  <div class="user-profile-section">
    <div
      class="user-profile-clickable"
      @click="emit('open-profile')"
      role="button"
      tabindex="0"
      @keydown.enter="emit('open-profile')"
      @keydown.space.prevent="emit('open-profile')"
      aria-label="پروفایل و تنظیمات"
    >
      <div class="user-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="آواتار" class="avatar-img" />
        <span v-else>{{ (username || '?').charAt(0).toUpperCase() }}</span>
      </div>
      <div class="user-profile-info">
        <div class="user-profile-name">{{ displayName || username }}</div>
        <div class="user-profile-status">{{ statusText }}</div>
      </div>
    </div>

    <button
      type="button"
      class="theme-toggle-btn"
      @click.stop="toggleTheme"
      :aria-label="isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'"
      :title="isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'"
    >
      <svg v-if="isDark" class="icon-svg" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg v-else class="icon-svg" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  </div>
</template>
