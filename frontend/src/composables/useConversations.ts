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

function reconcileConversations(
  current: Conversation[],
  incoming: Conversation[],
  messagesByUser?: Record<number, Message[]>
): void {
  const incomingMap = new Map<number, Conversation>();
  for (const item of incoming) {
    incomingMap.set(Number(item.user_id), item);
  }

  // 1. Remove deleted conversations
  for (let i = current.length - 1; i >= 0; i--) {
    const uid = Number(current[i].user_id);
    if (!incomingMap.has(uid)) {
      current.splice(i, 1);
    }
  }

  // 2. Update existing in-place or add new
  for (const item of incoming) {
    const uid = Number(item.user_id);
    const existing = current.find((c) => Number(c.user_id) === uid);
    if (existing) {
      if (existing.id !== item.id) existing.id = item.id;
      if (existing.username !== item.username) existing.username = item.username;
      if (existing.display_name !== item.display_name) existing.display_name = item.display_name;
      if (existing.avatar_url !== item.avatar_url) existing.avatar_url = item.avatar_url;
      if (existing.is_online !== item.is_online) existing.is_online = item.is_online;
      if (existing.unread_count !== item.unread_count) existing.unread_count = item.unread_count;
      if (existing.last_message_at !== item.last_message_at) existing.last_message_at = item.last_message_at;
      if (existing.last_message_preview !== item.last_message_preview) existing.last_message_preview = item.last_message_preview;
      if (item.last_message) existing.last_message = item.last_message;
    } else {
      current.push(item);
    }

    if (item.last_message && messagesByUser && (!messagesByUser[uid] || messagesByUser[uid].length === 0)) {
      messagesByUser[uid] = [item.last_message];
    }
  }

  sortConversationsInPlace(current, messagesByUser);
}

  async function loadConversationsList(
    token: string,
    messagesByUser?: Record<number, Message[]>
  ): Promise<boolean> {
    if (!token) return false;
    if (conversations.value.length === 0) {
      loadingConversations.value = true;
    }
    try {
      const res = await fetchConversations(API_URL, token);
      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorized();
        }
        return false;
      }
      const data = await res.json();
      const incoming: Conversation[] = data.conversations || [];
      reconcileConversations(conversations.value, incoming, messagesByUser);
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

    // 1. Batch decrypt any attached last_message items in memory (0 network requests)
    const messagesToDecrypt: Message[] = [];
    const uidMap: Record<number, number> = {};

    for (const conv of conversations.value) {
      const uid = Number(conv.user_id);
      if (!uid) continue;

      const localList = messagesByUser[uid];
      const targetMsg = (localList && localList.length > 0) ? localList[localList.length - 1] : conv.last_message;

      if (targetMsg) {
        if (!localList || localList.length === 0) {
          messagesByUser[uid] = [targetMsg];
        }
        if (targetMsg.encrypted && !targetMsg.content && targetMsg.id != null) {
          messagesToDecrypt.push(targetMsg);
          uidMap[targetMsg.id] = uid;
        }
      }
    }

    if (messagesToDecrypt.length > 0) {
      try {
        const decryptedList = await decryptFn(messagesToDecrypt);
        for (const dec of decryptedList) {
          if (dec.id != null) {
            const uid = uidMap[dec.id];
            if (uid && messagesByUser[uid]) {
              messagesByUser[uid] = [dec];
            }
          }
        }
      } catch (err) {
        console.warn('Failed to batch decrypt conversation previews:', err);
      }
    }

    // 2. Fallback only if there's any conversation still missing local preview (backwards compatibility)
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
