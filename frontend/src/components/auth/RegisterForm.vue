<script setup lang="ts">
import { useAuth } from '../../composables/useAuth';

const { registerForm, acceptRules, authError, handleRegister } = useAuth();
const emit = defineEmits<{
  (e: 'success'): void;
}>();

async function onSubmit() {
  const ok = await handleRegister();
  if (ok) {
    emit('success');
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <input
      type="text"
      v-model="registerForm.username"
      placeholder="نام‌کاربری"
      required
      autocomplete="username"
    />
    <input
      type="password"
      v-model="registerForm.password"
      placeholder="رمز‌عبور"
      required
      autocomplete="new-password"
    />
    <input
      type="password"
      v-model="registerForm.confirm"
      placeholder="تکرار رمز‌عبور"
      required
      autocomplete="new-password"
    />
    <label class="rules-checkbox">
      <input type="checkbox" v-model="acceptRules" required />
      <span>قوانین استفاده را می‌پذیرم</span>
    </label>
    <div class="error-message" v-if="authError">{{ authError }}</div>
    <button type="submit">ثبت‌نام</button>
  </form>
</template>
