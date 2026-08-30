import { computed, reactive, ref } from 'vue';
import type { Conversation, Message } from '../types';
import { API_URL, handleUnauthorized } from '../services/api';
import {
  clearUnreadCount,
  conversationsNeedingPreviewHydration,
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchConversations,
  findByUserId,
  updateLastMessageAt as updateLastMessageAtHelper,
} from '../services/conversations';
import { fetchMessages } from '../services/messages';
import { filterConversations, sortConversationsInPlace } from '../services/funcs';

const conversations = ref<Conversation[]>([]);
const currentConversationId = ref<number | null>(null);
const searchQuery = ref<string>('');
const loadingConversations = ref<boolean>(false);
const chatListOpen = ref<boolean>(true);
const showNewChatModal = ref<boolean>(false);

const conversationMenu = reactive<{
  show: boolean;
  x: number;
  y: number;
  conversation: Conversation | null;
}>({
  show: false,
  x: 0,
  y: 0,
  conversation: null,
});

export function useConversations() {
  const currentConversation = computed<Conversation | null>(() => {
    if (!currentConversationId.value) return null;
    return findByUserId(conversations.value, currentConversationId.value) || null;
  });

  const filteredConversations = computed(() => {
    return filterConversations(conversations.value, searchQuery.value);
  });

  function sortList(messagesByUser?: Record<number, Message[]>) {
    sortConversationsInPlace(conversations.value, messagesByUser);
  }

  function updateConversationLastMessage(
    userId: number,
    timestamp: string,
    messagesByUser?: Record<number, Message[]>
  ) {
    if (updateLastMessageAtHelper(conversations.value, userId, timestamp)) {
      sortList(messagesByUser);
    }
  }

  async function loadConversationsList(
    token: string,
    messagesByUser?: Record<number, Message[]>
  ): Promise<boolean> {
    if (!token) return false;
    loadingConversations.value = true;
    try {
      const res = await fetchConversations(API_URL, token);
      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorized();
        }
        return false;
      }
      const data = await res.json();
      conversations.value = data.conversations || [];
      sortList(messagesByUser);
      return true;
    } catch (err) {
      console.error('Failed to load conversations:', err);
      return false;
    } finally {
      loadingConversations.value = false;
    }
  }

  async function hydrateEncryptedConversationPreviews(
    token: string,
    messagesByUser: Record<number, Message[]>,
    decryptFn: (messages: Message[]) => Promise<Message[]>
  ): Promise<void> {
    if (!token) return;
    const needing = conversationsNeedingPreviewHydration(conversations.value, messagesByUser);
    for (const conv of needing) {
      const uid = conv.user_id;
      if (!uid || (messagesByUser[uid] && messagesByUser[uid].length > 0)) continue;
      fetchMessages(API_URL, token, { userId: uid, limit: 1 })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          const raw = data.messages || [];
          if (!raw.length) return;
          const decrypted = await decryptFn(raw);
          if (decrypted.length && (!messagesByUser[uid] || messagesByUser[uid].length === 0)) {
            messagesByUser[uid] = decrypted;
          }
        })
        .catch((err) => {
          console.warn('Failed to hydrate preview for conversation:', uid, err);
        });
    }
  }

  function selectConversation(conv: Conversation) {
    closeConversationMenu();
    currentConversationId.value = conv.user_id;
    chatListOpen.value = false;
    clearUnreadCount(conversations.value, conv.user_id);
  }

  function closeConversation() {
    currentConversationId.value = null;
    chatListOpen.value = true;
  }

  function goBackToList() {
    closeConversation();
  }

  async function startNewConversation(
    token: string,
    userId: number,
    _username?: string,
    _displayName?: string,
    _avatarUrl?: string,
    isOnline = false
  ): Promise<Conversation> {
    const existing = findByUserId(conversations.value, userId);
    if (existing) {
      existing.is_online = isOnline;
      selectConversation(existing);
      return existing;
    }

    const created = await createConversation(API_URL, token, userId);
    conversations.value.unshift(created);
    selectConversation(created);
    return created;
  }

  async function deleteSelectedConversation(
    token: string,
    conv: Conversation
  ): Promise<boolean> {
    if (!conv?.id) return false;
    const res = await deleteConversationApi(API_URL, token, conv.id);
    if (!res.ok) throw new Error('Failed to delete conversation');

    conversations.value = conversations.value.filter((c) => c.id !== conv.id);
    if (currentConversationId.value === conv.user_id) {
      closeConversation();
    }
    return true;
  }

  function openConversationMenu(event: MouseEvent, conv: Conversation) {
    const targetRect = (event.currentTarget as HTMLElement)?.getBoundingClientRect();
    const padding = 12;
    const menuWidth = 160;
    const menuHeight = 56;

    let x = targetRect ? targetRect.left : event.clientX || 0;
    let y = targetRect ? targetRect.bottom : event.clientY || 0;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + menuWidth + padding > viewportWidth) {
      x = viewportWidth - menuWidth - padding;
    }
    if (x < padding) x = padding;

    if (y + menuHeight + padding > viewportHeight) {
      y = targetRect ? targetRect.top - menuHeight : viewportHeight - menuHeight - padding;
    }
    if (y < padding) y = padding;

    conversationMenu.show = true;
    conversationMenu.x = x;
    conversationMenu.y = y;
    conversationMenu.conversation = conv;
  }

  function closeConversationMenu() {
    conversationMenu.show = false;
    conversationMenu.conversation = null;
  }

  return {
    conversations,
    currentConversationId,
    currentConversation,
    searchQuery,
    loadingConversations,
    chatListOpen,
    showNewChatModal,
    conversationMenu,
    filteredConversations,
    sortList,
    updateConversationLastMessage,
    loadConversationsList,
    hydrateEncryptedConversationPreviews,
    selectConversation,
    closeConversation,
    goBackToList,
    startNewConversation,
    deleteSelectedConversation,
    openConversationMenu,
    closeConversationMenu,
  };
}
