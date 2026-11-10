<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../../../composables/useAuth';
import { useToast } from '../../../composables/useToast';
import { subscribePush, unsubscribePush } from '../../../services/push';
import { API_URL } from '../../../services/api';

const { token } = useAuth();
const { showToast } = useToast();

const pushNotificationsEnabled = ref<boolean>(
  typeof localStorage !== 'undefined' && localStorage.getItem('pushNotificationsEnabled') === 'true'
);

const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

async function togglePushNotifications() {
  if (!token.value) return;
  if (pushNotificationsEnabled.value) {
    try {
      await subscribePush(API_URL, token.value);
      localStorage.setItem('pushNotificationsEnabled', 'true');
      showToast('اعلان‌ها فعال شد');
    } catch (err) {
      console.error('Push subscribe failed:', err);
      pushNotificationsEnabled.value = false;
      localStorage.removeItem('pushNotificationsEnabled');
      showToast('فعال‌سازی اعلان‌ها ناموفق بود', 'error');
    }
  } else {
    try {
      await unsubscribePush(API_URL, token.value);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
    localStorage.removeItem('pushNotificationsEnabled');
    showToast('اعلان‌ها غیرفعال شد');
  }
}
</script>

<template>
  <div class="profile-section">
    <div class="profile-form-group push-toggle-group">
      <div class="push-toggle-text">
        <label for="push-toggle">اعلان پیام جدید</label>
        <p class="field-hint">{{ pushSupported ? 'با رسیدن پیام جدید، حتی وقتی برنامه بسته است، اعلان دریافت کنید.' : 'مرورگر شما از اعلان‌ها پشتیبانی نمی‌کند.' }}</p>
      </div>
      <label class="toggle-switch">
        <input
          id="push-toggle"
          type="checkbox"
          :disabled="!pushSupported"
          v-model="pushNotificationsEnabled"
          @change="togglePushNotifications"
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</template>
