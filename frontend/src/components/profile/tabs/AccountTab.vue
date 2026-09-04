<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../../../composables/useAuth';
import { useConfirm } from '../../../composables/useConfirm';
import { useToast } from '../../../composables/useToast';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'logout'): void;
}>();

const { username, deleteAccount } = useAuth();
const { confirm } = useConfirm();
const { showToast } = useToast();

const deleteAccountConfirm = ref<string>('');
const deletingAccount = ref<boolean>(false);

async function onLogout() {
  const ok = await confirm({
    title: 'خروج از حساب',
    message: 'آیا از خروج از حساب کاربری اطمینان دارید؟',
    confirmText: 'خروج',
    cancelText: 'انصراف',
    variant: 'danger',
  });
  if (ok) {
    emit('close');
    emit('logout');
  }
}

async function onDeleteAccount() {
  if (!username.value || deleteAccountConfirm.value.trim() !== username.value) {
    showToast('نام کاربری وارد شده صحیح نیست', 'error');
    return;
  }
  const ok = await confirm({
    title: 'حذف دائمی حساب کاربری',
    message: 'این عملیات غیرقابل بازگشت است و تمامی پیام‌ها و اطلاعات شما حذف خواهند شد. آیا اطمینان دارید؟',
    confirmText: 'حذف دائمی حساب',
    cancelText: 'انصراف',
    variant: 'danger',
  });
  if (!ok) {
    return;
  }

  deletingAccount.value = true;
  try {
    await deleteAccount(deleteAccountConfirm.value);
    showToast('حساب کاربری حذف شد', 'success');
    emit('close');
    emit('logout');
  } catch (err: any) {
    console.error('Error deleting account:', err);
    showToast(err.message || 'خطا در حذف حساب', 'error');
  } finally {
    deletingAccount.value = false;
  }
}
</script>

<template>
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
