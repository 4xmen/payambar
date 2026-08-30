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
  <div class="user-item" @click="selectUser">
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
    <span class="chevron">›</span>
  </div>
</template>
