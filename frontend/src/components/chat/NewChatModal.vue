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
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    } else {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
    }
  }
);

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
  emit('select-user', user);
}
</script>

<template>
  <div v-if="isOpen" class="modal" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>مکالمه جدید</h3>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="بستن">
          ×
        </button>
      </div>

      <div class="search-user-container">
        <input
          type="text"
          ref="searchInputRef"
          class="search-user-input"
          v-model="searchQuery"
          @input="onInput"
          placeholder="نام کاربری را جستجو کنید..."
        />
      </div>

      <div class="users-list">
        <p v-if="!searchQuery.trim()" class="search-hint">نام کاربری را وارد کنید</p>
        <p v-else-if="searchLoading" class="searching">در حال جستجو...</p>
        <p v-else-if="searchError" class="empty">{{ searchError }}</p>
        <p v-else-if="searchResults.length === 0" class="empty">کاربری یافت نشد</p>
        <UserSearchItem
          v-else
          v-for="user in searchResults"
          :key="user.id"
          :user="user"
          @select="selectSearchedUser"
        />
      </div>
    </div>
  </div>
</template>
