<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../../../composables/useAuth';
import { useToast } from '../../../composables/useToast';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const {
  username,
  profileDisplayName,
  myAvatarUrl,
  saveProfile,
  uploadAvatar,
} = useAuth();
const { showToast } = useToast();

const avatarInputRef = ref<HTMLInputElement | null>(null);
const displayNameEdit = ref<string>(profileDisplayName.value || '');
const uploadingAvatar = ref<boolean>(false);
const isSaving = ref<boolean>(false);

async function handleAvatarUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('لطفا یک فایل تصویری انتخاب کنید');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('حجم آواتار باید کمتر از ۲ مگابایت باشد');
    return;
  }

  uploadingAvatar.value = true;
  try {
    await uploadAvatar(file);
    showToast('آواتار بروزرسانی شد');
  } catch (err) {
    console.error('Avatar upload error:', err);
    alert('خطا در آپلود آواتار');
  } finally {
    uploadingAvatar.value = false;
    target.value = '';
  }
}

async function onSaveProfile() {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    await saveProfile(displayNameEdit.value);
    showToast('پروفایل ذخیره شد');
    emit('close');
  } catch (err) {
    console.error('Error saving profile:', err);
    alert('خطا در ذخیره پروفایل');
  } finally {
    isSaving.value = false;
  }
}

defineExpose({
  onSaveProfile,
  isSaving,
});
</script>

<template>
  <div class="profile-tab-content">
    <div class="profile-avatar-section">
      <div
        class="profile-avatar-large"
        @click="avatarInputRef?.click()"
        title="تغییر آواتار"
      >
        <img v-if="myAvatarUrl" :src="myAvatarUrl" alt="آواتار" class="avatar-img-large" />
        <span v-else>{{ (username || '?').charAt(0).toUpperCase() }}</span>
        <div class="avatar-edit-overlay">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
            />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>
      <input
        type="file"
        ref="avatarInputRef"
        @change="handleAvatarUpload"
        accept="image/*"
        style="display: none"
      />
      <div class="profile-avatar-name">{{ profileDisplayName || username }}</div>
      <div v-if="uploadingAvatar" class="avatar-upload-status">در حال آپلود...</div>
    </div>

    <form id="profile-form" class="profile-section" @submit.prevent="onSaveProfile">
      <div class="profile-form-group">
        <label for="profile-username">نام کاربری</label>
        <input id="profile-username" type="text" :value="username" disabled />
      </div>
      <div class="profile-form-group">
        <label for="profile-display-name">نام نمایشی</label>
        <input
          id="profile-display-name"
          type="text"
          v-model="displayNameEdit"
          autocomplete="name"
          placeholder="نام نمایشی خود را وارد کنید"
          autofocus
        />
      </div>
    </form>
  </div>
</template>
