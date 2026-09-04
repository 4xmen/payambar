<script setup lang="ts">
import { useAuth } from '../../composables/useAuth';
import LoginForm from './LoginForm.vue';
import RegisterForm from './RegisterForm.vue';
import RulesModal from './RulesModal.vue';

defineProps<{
  appVersion?: string;
}>();

const emit = defineEmits<{
  (e: 'authenticated'): void;
}>();

const { authTab, showRulesModal } = useAuth();

function onAuthSuccess() {
  emit('authenticated');
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-logo">
          <img src="/favicon.svg" alt="PayamBar" width="30" height="30" />
        </div>
        <div class="auth-title">
          <h1>
            PayamBar
            <small v-if="appVersion" class="auth-version">{{ appVersion }}</small>
          </h1>
          <p class="auth-subtitle">پیام‌رسان ساده، سریع و رمزنگاری‌شده</p>
        </div>
      </div>
      <div class="auth-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'login' }"
          @click="authTab = 'login'"
        >
          ورود
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'register' }"
          @click="authTab = 'register'"
        >
          ثبت‌نام
        </button>
      </div>

      <transition name="auth-mode" mode="out-in">
        <LoginForm v-if="authTab === 'login'" @success="onAuthSuccess" />
        <RegisterForm v-else @success="onAuthSuccess" />
      </transition>

      <div class="auth-footer">
        <button type="button" class="link-btn" @click="showRulesModal = true">
          مشاهده قوانین
        </button>
      </div>
    </div>

    <transition name="modal-fade">
      <RulesModal v-if="showRulesModal" @close="showRulesModal = false" />
    </transition>
  </div>
</template>
