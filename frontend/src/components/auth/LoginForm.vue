<script setup lang="ts">
import { useAuth } from '../../composables/useAuth';

const { loginForm, authError, handleLogin } = useAuth();
const emit = defineEmits<{
  (e: 'success'): void;
}>();

async function onSubmit() {
  const ok = await handleLogin();
  if (ok) {
    emit('success');
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <input
      type="text"
      v-model="loginForm.username"
      placeholder="نام‌کاربری"
      required
      autocomplete="username"
    />
    <input
      type="password"
      v-model="loginForm.password"
      placeholder="رمز‌عبور"
      required
      autocomplete="current-password"
    />
    <div class="error-message" v-if="authError">{{ authError }}</div>
    <button type="submit">ورود امن</button>
  </form>
</template>
