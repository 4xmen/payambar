<script setup lang="ts">
defineProps<{
  appVersion?: string;
}>();
</script>

<template>
  <div class="profile-section about-section">
    <div class="about-logo">P</div>
    <div class="about-title">PayamBar</div>
    <div class="about-version">نسخه {{ appVersion || 'dev' }}</div>
  </div>
</template>
