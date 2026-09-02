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
      alert('فعال‌سازی اعلان‌ها ناموفق بود');
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
      <label>اعلان پیام جدید</label>
      <label class="toggle-switch">
        <input
          type="checkbox"
          v-model="pushNotificationsEnabled"
          @change="togglePushNotifications"
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</template>
