<script setup lang="ts">
import { useToast } from '../../composables/useToast';

const { toastText, isVisible } = useToast();
</script>

<template>
  <div id="toast" :class="{ show: isVisible }">
    {{ toastText }}
  </div>
</template>
