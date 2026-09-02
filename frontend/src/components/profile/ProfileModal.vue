<script setup lang="ts">
import { ref, watch } from 'vue';
import ProfileTab from './tabs/ProfileTab.vue';
import NotificationsTab from './tabs/NotificationsTab.vue';
import AccountTab from './tabs/AccountTab.vue';
import AboutTab from './tabs/AboutTab.vue';

const props = defineProps<{
  appVersion?: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'logout'): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const profileTabRef = ref<InstanceType<typeof ProfileTab> | null>(null);
const activeTab = ref<'profile' | 'notifications' | 'account' | 'about'>('profile');

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
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
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  } else {
    emit('close');
  }
}

function handleNativeClose() {
  emit('close');
}

function handleBackdropClick(e: MouseEvent) {
  // Native HTML <dialog> backdrop click detection:
  // When clicked on the ::backdrop pseudo-element, event.target is the dialog itself.
  if (dialogRef.value && e.target === dialogRef.value) {
    closeModal();
  }
}
</script>

<template>
  <dialog
    id="profile-modal"
    ref="dialogRef"
    class="modal"
    aria-labelledby="profile-modal-title"
    @cancel.prevent="closeModal"
    @close="handleNativeClose"
    @click="handleBackdropClick"
  >
    <div class="modal-content profile-modal-sheet" tabindex="-1" autofocus>
      <header class="modal-header">
        <h3 id="profile-modal-title">پروفایل</h3>
        <form method="dialog">
          <button type="submit" class="close-btn" aria-label="بستن">
            <svg class="icon-svg" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
      </header>

      <nav class="profile-tabs" role="tablist" aria-label="تنظیمات">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'profile'"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          پروفایل
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'notifications'"
          :class="{ active: activeTab === 'notifications' }"
          @click="activeTab = 'notifications'"
        >
          اعلان‌ها
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'account'"
          :class="{ active: activeTab === 'account' }"
          @click="activeTab = 'account'"
        >
          حساب
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'about'"
          :class="{ active: activeTab === 'about' }"
          @click="activeTab = 'about'"
        >
          درباره
        </button>
      </nav>

      <main class="profile-modal-content">
        <ProfileTab
          v-if="activeTab === 'profile'"
          ref="profileTabRef"
          @close="closeModal"
        />

        <NotificationsTab
          v-else-if="activeTab === 'notifications'"
        />

        <AccountTab
          v-else-if="activeTab === 'account'"
          @close="closeModal"
          @logout="emit('logout')"
        />

        <AboutTab
          v-else
          :app-version="appVersion"
        />
      </main>

      <!-- Sticky Native Footer for Profile edit -->
      <footer class="profile-modal-footer" v-if="activeTab === 'profile'">
        <div class="profile-footer-actions">
          <form method="dialog">
            <button type="submit" class="btn-secondary">
              انصراف
            </button>
          </form>
          <button
            type="submit"
            form="profile-form"
            class="btn-primary"
            :disabled="profileTabRef?.isSaving"
          >
            {{ profileTabRef?.isSaving ? 'در حال ذخیره...' : 'ذخیره تغییرات' }}
          </button>
        </div>
      </footer>
    </div>
  </dialog>
</template>
