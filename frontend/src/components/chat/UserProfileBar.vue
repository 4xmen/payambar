<script setup lang="ts">
defineProps<{
  avatarUrl: string | null;
  username: string | null;
  displayName: string;
  statusText: string;
}>();

const emit = defineEmits<{
  (e: 'open-profile'): void;
}>();
</script>

<template>
  <div class="user-profile-section">
    <div class="user-avatar" @click="emit('open-profile')">
      <img v-if="avatarUrl" :src="avatarUrl" alt="آواتار" class="avatar-img" />
      <span v-else>{{ (username || '?').charAt(0).toUpperCase() }}</span>
    </div>
    <div class="user-profile-info" @click="emit('open-profile')">
      <div class="user-profile-name">{{ displayName || username }}</div>
      <div class="user-profile-status">{{ statusText }}</div>
    </div>
  </div>
</template>
