<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../../composables/useAuth';

const { loginForm, authError, isAuthLoading, handleLogin } = useAuth();
const showPassword = ref<boolean>(false);

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
    <div class="form-group">
      <label for="login-username" class="form-label">نام کاربری</label>
      <input
        id="login-username"
        type="text"
        v-model="loginForm.username"
        placeholder="نام‌کاربری"
        required
        autocomplete="username"
      />
    </div>

    <div class="form-group">
      <label for="login-password" class="form-label">رمز عبور</label>
      <div class="password-input-wrapper">
        <input
          id="login-password"
          :type="showPassword ? 'text' : 'password'"
          v-model="loginForm.password"
          placeholder="رمز‌عبور"
          required
          autocomplete="current-password"
        />
        <button
          type="button"
          class="password-toggle-btn"
          @click="showPassword = !showPassword"
          :aria-label="showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'"
          :title="showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'"
        >
          <!-- Eye Open -->
          <svg
            v-if="!showPassword"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <!-- Eye Closed / Off -->
          <svg
            v-else
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        </button>
      </div>
    </div>

    <div class="error-message" v-if="authError">{{ authError }}</div>
    <button type="submit" :disabled="isAuthLoading">
      <span v-if="isAuthLoading" class="btn-spinner"></span>
      <span>{{ isAuthLoading ? 'در حال ورود...' : 'ورود امن' }}</span>
    </button>
  </form>
</template>
