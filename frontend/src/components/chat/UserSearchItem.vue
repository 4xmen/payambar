<script setup lang="ts">
import { computed } from 'vue';
import type { SearchUser } from '../../types';
import { normalizeSearchUser } from '../../services/funcs';

const props = defineProps<{
  user: any;
}>();

const emit = defineEmits<{
  (e: 'select', user: SearchUser): void;
}>();

const normalizedUser = computed<SearchUser>(() => {
  return normalizeSearchUser(props.user);
});

function selectUser() {
  emit('select', normalizedUser.value);
}
</script>

<template>
  <div
    class="user-item"
    role="button"
    tabindex="0"
    @click="selectUser"
    @keydown.enter="selectUser"
    @keydown.space.prevent="selectUser"
  >
    <div class="user-avatar-wrapper">
      <img
        v-if="normalizedUser.avatarUrl"
        :src="normalizedUser.avatarUrl"
        class="user-avatar"
        alt="avatar"
      />
      <span v-else class="user-avatar-placeholder">
        {{ normalizedUser.nameLabel.charAt(0).toUpperCase() }}
      </span>
      <span v-if="normalizedUser.isOnline" class="online-indicator"></span>
    </div>
    <div class="user-info">
      <div class="user-display-name">{{ normalizedUser.nameLabel }}</div>
      <div class="user-username">
        @{{ normalizedUser.username }}
        <span v-if="normalizedUser.isOnline" class="online-text"> آنلاین</span>
      </div>
    </div>
    <span class="chevron" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </span>
  </div>
</template>
