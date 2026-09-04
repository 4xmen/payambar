<script setup lang="ts">
import { useToast } from '../../composables/useToast';

const { toastText, toastType, isVisible } = useToast();
</script>

<template>
  <div
    id="toast"
    :class="[{ show: isVisible }, toastType]"
    role="status"
    aria-live="polite"
  >
    <span class="toast-dot" :class="toastType"></span>
    <span>{{ toastText }}</span>
  </div>
</template>
