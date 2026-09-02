<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { SearchUser } from '../../types';
import { API_URL, authHeaders } from '../../services/api';
import UserSearchItem from './UserSearchItem.vue';

const props = defineProps<{
  isOpen: boolean;
  token: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-user', user: SearchUser): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchQuery = ref<string>('');
const searchResults = ref<any[]>([]);
const searchLoading = ref<boolean>(false);
const searchError = ref<string>('');
let searchTimeout: any = null;

const DEBOUNCE_MS = 500;

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = '';
      searchResults.value = [];
      searchError.value = '';
      searchLoading.value = false;
      if (dialogRef.value && !dialogRef.value.open) {
        dialogRef.value.showModal();
      }
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    } else {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
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
  // Native HTML <dialog> backdrop click: event.target is the dialog element itself
  if (dialogRef.value && e.target === dialogRef.value) {
    closeModal();
  }
}

function onInput() {
  const q = searchQuery.value.trim();
  searchError.value = '';
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (!q || q.length < 3) {
    searchLoading.value = false;
    searchResults.value = [];
    return;
  }
  searchLoading.value = true;
  searchTimeout = setTimeout(() => {
    executeSearch(q);
  }, DEBOUNCE_MS);
}

async function executeSearch(query: string) {
  if (!props.token) return;
  try {
    const res = await fetch(`${API_URL}/users?q=${encodeURIComponent(query)}`, {
      headers: authHeaders(props.token),
    });
    if (!res.ok) throw new Error('Search failed');
    const users = await res.json();
    searchResults.value = Array.isArray(users) ? users : [];
  } catch (err) {
    console.error('Search error:', err);
    searchResults.value = [];
    searchError.value = 'خطا در جستجو';
  } finally {
    searchLoading.value = false;
    searchTimeout = null;
  }
}

function selectSearchedUser(user: SearchUser) {
  closeModal();
  emit('select-user', user);
}
</script>

<template>
  <dialog
    id="new-chat-modal"
    ref="dialogRef"
    class="modal"
    aria-labelledby="new-chat-title"
    @cancel.prevent="closeModal"
    @close="handleNativeClose"
    @click="handleBackdropClick"
  >
    <div class="modal-content" tabindex="-1" autofocus>
      <header class="modal-header">
        <h3 id="new-chat-title">مکالمه جدید</h3>
        <form method="dialog">
          <button type="submit" class="close-btn" aria-label="بستن">
            <svg class="icon-svg" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
      </header>

      <div class="search-user-container">
        <div class="search-input-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            ref="searchInputRef"
            class="search-user-input"
            v-model="searchQuery"
            @input="onInput"
            placeholder="نام کاربری را جستجو کنید..."
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
        </div>
      </div>

      <ul class="users-list" role="list">
        <li v-if="!searchQuery.trim()" class="search-hint">
          <span>حداقل ۳ حرف برای جستجو وارد کنید</span>
        </li>
        <li v-else-if="searchLoading" class="searching">
          <span>در حال جستجو...</span>
        </li>
        <li v-else-if="searchError" class="empty">
          <span>{{ searchError }}</span>
        </li>
        <li v-else-if="searchResults.length === 0" class="empty">
          <span>کاربری یافت نشد</span>
        </li>
        <li
          v-else
          v-for="user in searchResults"
          :key="user.id"
          class="user-list-item"
        >
          <UserSearchItem
            :user="user"
            @select="selectSearchedUser"
          />
        </li>
      </ul>
    </div>
  </dialog>
</template>
