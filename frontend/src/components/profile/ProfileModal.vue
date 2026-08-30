<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { useToast } from '../../composables/useToast';
import { subscribePush, unsubscribePush } from '../../services/push';
import { API_URL } from '../../services/api';

const props = defineProps<{
  appVersion?: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'logout'): void;
}>();

const {
  token,
  username,
  profileDisplayName,
  myAvatarUrl,
  saveProfile,
  uploadAvatar,
  deleteAccount,
} = useAuth();
const { showToast } = useToast();

const dialogRef = ref<HTMLDialogElement | null>(null);
const avatarInputRef = ref<HTMLInputElement | null>(null);

const activeTab = ref<'profile' | 'notifications' | 'account' | 'about'>('profile');
const displayNameEdit = ref<string>('');
const uploadingAvatar = ref<boolean>(false);
const pushNotificationsEnabled = ref<boolean>(false);
const deleteAccountConfirm = ref<string>('');
const deletingAccount = ref<boolean>(false);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      displayNameEdit.value = profileDisplayName.value || '';
      pushNotificationsEnabled.value =
        localStorage.getItem('pushNotificationsEnabled') === 'true';
      if (dialogRef.value && !dialogRef.value.open) {
        dialogRef.value.showModal();
      }
    } else {
      if (dialogRef.value?.open) {
        dialogRef.value.close();
      }
    }
  }
);

function closeModal() {
  emit('close');
}

function handleBackdropClick(e: MouseEvent) {
  if (dialogRef.value && e.target === dialogRef.value) {
    closeModal();
  }
}

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
  try {
    await saveProfile(displayNameEdit.value);
    showToast('پروفایل ذخیره شد');
    closeModal();
  } catch (err) {
    console.error('Error saving profile:', err);
    alert('خطا در ذخیره پروفایل');
  }
}

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

function onLogout() {
  if (confirm('آیا از خروج اطمینان دارید؟')) {
    closeModal();
    emit('logout');
  }
}

async function onDeleteAccount() {
  if (!username.value || deleteAccountConfirm.value.trim() !== username.value) {
    alert('نام کاربری وارد شده صحیح نیست');
    return;
  }
  if (!confirm('این عملیات غیرقابل بازگشت است. آیا از حذف حساب اطمینان دارید؟')) {
    return;
  }

  deletingAccount.value = true;
  try {
    await deleteAccount(deleteAccountConfirm.value);
    alert('حساب کاربری حذف شد');
    closeModal();
    emit('logout');
  } catch (err: any) {
    console.error('Error deleting account:', err);
    alert(err.message || 'خطا در حذف حساب');
  } finally {
    deletingAccount.value = false;
  }
}
</script>

<template>
  <dialog
    id="profile-modal"
    ref="dialogRef"
    class="modal"
    @click="handleBackdropClick"
  >
    <div class="modal-content profile-modal-sheet" tabindex="-1" autofocus style="outline: none;">
      <div class="modal-header">
        <h3>پروفایل</h3>
        <form method="dialog">
          <button type="button" class="close-btn" @click="closeModal" aria-label="بستن">
            <svg class="icon-svg" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
      </div>

      <div class="profile-tabs" role="tablist" aria-label="تنظیمات">
        <button
          type="button"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          پروفایل
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'notifications' }"
          @click="activeTab = 'notifications'"
        >
          اعلان‌ها
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'account' }"
          @click="activeTab = 'account'"
        >
          حساب
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'about' }"
          @click="activeTab = 'about'"
        >
          درباره
        </button>
      </div>

      <div class="profile-modal-content">
        <!-- Tab 1: Profile -->
        <template v-if="activeTab === 'profile'">
          <div class="profile-avatar-section">
            <div
              class="profile-avatar-large"
              @click="avatarInputRef?.click()"
              style="cursor: pointer;"
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

          <div class="profile-section">
            <div class="profile-form-group">
              <label>نام کاربری</label>
              <input type="text" :value="username" disabled />
            </div>
            <div class="profile-form-group">
              <label>نام نمایشی</label>
              <input
                type="text"
                v-model="displayNameEdit"
                autocomplete="name"
                placeholder="نام نمایشی خود را وارد کنید"
              />
            </div>
          </div>
        </template>

        <!-- Tab 2: Notifications -->
        <template v-else-if="activeTab === 'notifications'">
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

        <!-- Tab 3: Account -->
        <template v-else-if="activeTab === 'account'">
          <div class="profile-section">
            <button type="button" class="btn-logout-inline" @click="onLogout">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              خروج از حساب
            </button>
            <div class="danger-text">
              برای حذف حساب، نام کاربری خود را وارد کنید. این عملیات غیرقابل بازگشت است.
            </div>
            <input
              type="text"
              v-model="deleteAccountConfirm"
              placeholder="نام کاربری"
              class="danger-input"
            />
            <button
              type="button"
              class="btn-danger"
              @click="onDeleteAccount"
              :disabled="deletingAccount || deleteAccountConfirm.trim() !== username"
            >
              {{ deletingAccount ? 'در حال حذف...' : 'حذف حساب' }}
            </button>
          </div>
        </template>

        <!-- Tab 4: About -->
        <template v-else>
          <div class="profile-section about-section">
            <div class="about-logo">P</div>
            <div class="about-title">PayamBar</div>
            <div class="about-version">نسخه {{ appVersion || 'dev' }}</div>
          </div>
        </template>
      </div>

      <!-- Sticky Footer for Profile edit -->
      <div class="profile-modal-footer" v-if="activeTab === 'profile'">
        <div class="profile-footer-actions">
          <button type="button" class="btn-primary" @click="onSaveProfile">
            ذخیره تغییرات
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>
