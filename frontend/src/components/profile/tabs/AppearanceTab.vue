<script setup lang="ts">
import { useTheme, type ThemePreference } from '../../../composables/useTheme';

const { preference, setTheme } = useTheme();

const options: { id: ThemePreference; label: string; desc: string }[] = [
  {
    id: 'light',
    label: 'تم روشن',
    desc: 'صفحات و پس‌زمینه روشن',
  },
  {
    id: 'dark',
    label: 'تم تاریک',
    desc: 'کاهش خستگی چشم در محیط‌های کم‌نور',
  },
  {
    id: 'auto',
    label: 'خودکار (هماهنگ با سیستم)',
    desc: 'پیروی خودکار از تنظیمات دستگاه شما',
  },
];
</script>

<template>
  <div class="profile-section appearance-section">
    <div class="appearance-title">انتخاب تم ظاهری</div>

    <div class="theme-options-list" role="radiogroup" aria-label="انتخاب تم">
      <div
        v-for="opt in options"
        :key="opt.id"
        class="theme-option-card"
        :class="{ selected: preference === opt.id }"
        @click="setTheme(opt.id)"
        role="radio"
        :aria-checked="preference === opt.id"
        tabindex="0"
        @keydown.enter="setTheme(opt.id)"
        @keydown.space.prevent="setTheme(opt.id)"
      >
        <div class="theme-option-radio">
          <div class="radio-dot" v-if="preference === opt.id"></div>
        </div>

        <div class="theme-option-content">
          <div class="theme-option-label">{{ opt.label }}</div>
          <div class="theme-option-desc">{{ opt.desc }}</div>
        </div>

        <div class="theme-option-icon">
          <!-- Sun for light -->
          <svg v-if="opt.id === 'light'" class="icon-svg" viewBox="0 0 24 24">
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
          <!-- Moon for dark -->
          <svg v-else-if="opt.id === 'dark'" class="icon-svg" viewBox="0 0 24 24">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <!-- Monitor for auto -->
          <svg v-else class="icon-svg" viewBox="0 0 24 24">
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
