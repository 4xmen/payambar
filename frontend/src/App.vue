<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Conversation, Message, SearchUser } from './types';
import { API_URL, setUnauthorizedHandler } from './services/api';
import { unreadIncomingIds } from './services/messages';
import { findByUserId } from './services/conversations';

import { useAuth } from './composables/useAuth';
import { useConversations } from './composables/useConversations';
import { useMessages } from './composables/useMessages';
import { useCall } from './composables/useCall';
import { useE2EE } from './composables/useE2EE';
import { useToast } from './composables/useToast';
import { useConfirm } from './composables/useConfirm';
import { useAppWebSocket } from './composables/useAppWebSocket';
import { useNetworkStatus } from './composables/useNetworkStatus';

import AuthContainer from './components/auth/AuthContainer.vue';
import ProfileModal from './components/profile/ProfileModal.vue';
import ChatListPanel from './components/chat/ChatListPanel.vue';
import ChatPanel from './components/chat/ChatPanel.vue';
import ActiveCallBar from './components/call/ActiveCallBar.vue';
import IncomingCallModal from './components/call/IncomingCallModal.vue';
import OutgoingCallModal from './components/call/OutgoingCallModal.vue';
import ToastNotification from './components/ui/ToastNotification.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';

// Composables
const auth = useAuth();
const convs = useConversations();
const msgs = useMessages();
const call = useCall();
const e2ee = useE2EE();
const toast = useToast();
const { confirm: confirmModal } = useConfirm();

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null);

// WebSocket Composable
const ws = useAppWebSocket({
  onIncomingMessageScroll: () => {
    chatPanelRef.value?.scrollToBottom();
  },
});

// Network Status Composable
const { isOffline } = useNetworkStatus({
  onOffline: () => {
    ws.closeWebSocket(false);
  },
  onOnline: () => {
    ws.serverOffline.value = false;
    if (auth.isAuthed.value && auth.token.value) {
      convs.loadConversationsList(auth.token.value, msgs.messages);
      ws.connectWebSocket();
    }
  },
  onVisible: () => {
    if (auth.isAuthed.value && auth.token.value) {
      convs.loadConversationsList(auth.token.value, msgs.messages);
      ws.connectWebSocket();
    }
  },
});

// Destructure reactive state for clean template consumption (avoids .value in template)
const { isAuthed, token, userId, username, profileDisplayName, myAvatarUrl, showRulesModal } = auth;
const {
  chatListOpen,
  currentConversationId,
  currentConversation,
  conversations,
  searchQuery,
  filteredConversations,
  loadingConversations,
  showNewChatModal,
  conversationMenu,
} = convs;
const {
  messages,
  loadingMessages,
  loadingOlderMessages,
  messageText,
  recordingVoice,
  recordingElapsedSec,
  uploadingFile,
  sendingVoice,
  messageContextMenu,
  pullToRefresh,
} = msgs;
const {
  activeCall,
  incomingCall,
  outgoingCall,
  callDuration,
  isMuted,
} = call;
const { wsConnected, wsReconnectAttempts, wsMaxReconnectAttempts } = ws;

const appVersion = ref<string>('');
const isProfileModalOpen = ref<boolean>(false);

const userProfileStatusText = computed<string>(() => {
  if (!isAuthed.value) return '';
  if (isOffline.value) return 'آفلاین';
  if (wsConnected.value) return 'آنلاین';
  if (wsReconnectAttempts.value >= wsMaxReconnectAttempts) return 'آفلاین';
  return 'در حال اتصال...';
});

const currentMessages = computed<Message[]>(() => {
  return msgs.getMessagesForUser(currentConversationId.value);
});

const hasMoreCurrent = computed<boolean>(() => {
  if (!currentConversationId.value) return false;
  return Boolean(msgs.hasMoreMessages[currentConversationId.value]);
});

// Fetch App Version
async function fetchAppVersion() {
  try {
    const res = await fetch(`${API_URL}/version`);
    if (res.ok) {
      const data = await res.json();
      appVersion.value = data.version || '';
    }
  } catch (e) {
    console.warn('Failed to fetch app version:', e);
  }
}

// Conversation Selection and Message Loading
async function onSelectConversation(conv: Conversation) {
  convs.selectConversation(conv);
  pushHistory('chat', String(conv.user_id));
  const loaded = await msgs.loadConversationMessages(
    token.value || '',
    conv.user_id,
    (mList) => e2ee.decryptMessageList(token.value || '', userId.value || 0, mList)
  );

  const latest = loaded.length ? loaded[loaded.length - 1] : null;
  if (latest?.created_at) {
    convs.updateConversationLastMessage(conv.user_id, latest.created_at, messages);
  }

  if (wsConnected.value) {
    for (const msgId of unreadIncomingIds(loaded, userId.value || 0)) {
      ws.sendWsJson({ type: 'mark_read', message_id: msgId });
    }
  }

  nextTick(() => {
    setTimeout(() => {
      chatPanelRef.value?.scrollToBottom();
      chatPanelRef.value?.focusInput();
    }, 100);
  });
}

// Sending Messages
async function onSendMessage() {
  const content = (messageText.value || '').trim();
  if (
    !content ||
    !currentConversationId.value ||
    !userId.value ||
    !token.value ||
    !wsConnected.value
  ) {
    return;
  }

  const receiverId = Number(currentConversationId.value);
  const clientMessageId = `client-${Date.now()}`;

  const optimistic = msgs.sendTextMessageOptimistic({
    myUserId: userId.value,
    receiverId,
    content,
    clientMessageId,
  });

  convs.updateConversationLastMessage(receiverId, optimistic.created_at, messages);
  messageText.value = '';
  chatListOpen.value = false;

  let encryptedPayload: any = null;
  try {
    encryptedPayload = await e2ee.encryptTextMessage(token.value, receiverId, content);
  } catch (err) {
    console.warn('Encryption error, sending plaintext:', err);
  }

  if (e2ee.e2ee.enabled && !encryptedPayload && !e2ee.e2ee.noKeyWarnedRecipients[receiverId]) {
    toast.showToast('ارسال امن ممکن نیست؛ کلید مخاطب در دسترس نیست. پیام به صورت غیر رمزنگاری‌شده ارسال می‌شود.', 'warning', 4000);
    e2ee.e2ee.noKeyWarnedRecipients[receiverId] = true;
  }

  const payload = {
    type: 'message',
    receiver_id: receiverId,
    content: encryptedPayload ? '' : content,
    client_message_id: clientMessageId,
    ...(encryptedPayload || {}),
  };

  ws.sendWsJson(payload);

  nextTick(() => {
    chatPanelRef.value?.scrollToBottom();
    chatPanelRef.value?.focusInput();
  });
}

async function onSelectFile(file: File) {
  if (!currentConversationId.value || !token.value || !userId.value) return;
  const receiverId = Number(currentConversationId.value);
  const msg = await msgs.uploadFileMessage({
    token: token.value,
    receiverId,
    myUserId: userId.value,
    file,
    isWsOpen: wsConnected.value,
  });
  if (msg) {
    convs.updateConversationLastMessage(receiverId, msg.created_at, messages);
    nextTick(() => chatPanelRef.value?.scrollToBottom());
  }
  convs.loadConversationsList(token.value, messages);
}

async function onToggleVoice() {
  if (!currentConversationId.value || uploadingFile.value || sendingVoice.value) {
    return;
  }
  if (recordingVoice.value) {
    msgs.stopVoiceRecordingAndSend(async (file) => {
      await onSelectFile(file);
    });
    return;
  }
  await msgs.startVoiceRecording();
}

async function onLoadOlder() {
  if (
    !currentConversationId.value ||
    !token.value ||
    loadingOlderMessages.value
  ) {
    return;
  }
  const container = chatPanelRef.value?.getContainerEl?.();
  const oldScrollHeight = container ? container.scrollHeight : 0;
  const oldScrollTop = container ? container.scrollTop : 0;

  const older = await msgs.loadOlderMessages(
    token.value,
    currentConversationId.value,
    (mList) => e2ee.decryptMessageList(token.value || '', userId.value || 0, mList)
  );

  if (older && older.length > 0) {
    nextTick(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
      }
    });
  }
}

async function onRefreshConversation(options: { keepScroll?: boolean } = {}) {
  if (!currentConversationId.value || !token.value) return;
  const convUserId = currentConversationId.value;
  const container = chatPanelRef.value?.getContainerEl?.() || null;
  const wasNearBottom = msgs.isNearBottom(container);

  const loaded = await msgs.loadConversationMessages(
    token.value,
    convUserId,
    (mList) => e2ee.decryptMessageList(token.value || '', userId.value || 0, mList)
  );
  const latest = loaded.length ? loaded[loaded.length - 1] : null;
  if (latest?.created_at) {
    convs.updateConversationLastMessage(convUserId, latest.created_at, messages);
  }

  if (!options.keepScroll || wasNearBottom) {
    nextTick(() => {
      chatPanelRef.value?.scrollToBottom();
    });
  }
}

function onPullStart(event: TouchEvent | MouseEvent) {
  const container = chatPanelRef.value?.getContainerEl?.() || null;
  msgs.handlePullStart(event, container, currentConversationId.value);
}

function onPullMove(event: TouchEvent | MouseEvent) {
  msgs.handlePullMove(event);
}

function onPullEnd() {
  msgs.handlePullEnd(async () => {
    await onRefreshConversation({ keepScroll: false });
  });
}

function onStartCall() {
  if (!currentConversation.value) return;
  const c = currentConversation.value;
  call.startCall({
    receiverId: c.user_id,
    username: c.username,
    displayName: c.display_name,
    avatarUrl: c.avatar_url,
    sendWsMessage: ws.sendWsJson,
    onSaveCallLog: (otherUserId, logText) => {
      ws.sendWsJson({ type: 'message', receiver_id: otherUserId, content: logText });
    },
  });
}

function onAcceptCall() {
  call.acceptCall(ws.sendWsJson);
}

function onRejectCall() {
  call.rejectCall(ws.sendWsJson, (otherUserId, logText) => {
    ws.sendWsJson({ type: 'message', receiver_id: otherUserId, content: logText });
  });
}

function onHangupCall() {
  call.endCall({
    isInitiator: true,
    sendWsMessage: ws.sendWsJson,
    onSaveCallLog: (otherUserId, logText) => {
      ws.sendWsJson({ type: 'message', receiver_id: otherUserId, content: logText });
    },
  });
}

function returnToActiveCallChat() {
  if (!activeCall.value) return;
  const targetId = Number(activeCall.value.user_id);
  const target = findByUserId(conversations.value, targetId) || {
    id: 0,
    user_id: targetId,
    username: activeCall.value.username,
    display_name: activeCall.value.displayName,
    avatar_url: activeCall.value.avatar_url,
  };
  onSelectConversation(target);
}

async function onCopyMessage(msg: Message) {
  msgs.closeMessageContextMenu();
  if (!msg.content) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(msg.content);
    }
    toast.showToast('کپی شد');
  } catch {
    toast.showToast('کپی نشد');
  }
}

async function onDeleteMessage(msg: Message) {
  msgs.closeMessageContextMenu();
  if (!msg.id || !currentConversationId.value || !token.value) return;
  const ok = await confirmModal({
    title: 'حذف پیام',
    message: 'آیا از حذف این پیام اطمینان دارید؟',
    confirmText: 'حذف پیام',
    cancelText: 'انصراف',
    variant: 'danger',
  });
  if (!ok) return;
  try {
    await msgs.deleteMessageById(token.value, currentConversationId.value, msg.id);
    toast.showToast('پیام حذف شد', 'success');
  } catch {
    toast.showToast('خطا در حذف پیام', 'error');
  }
}

async function onDeleteConversation(conv: Conversation) {
  convs.closeConversationMenu();
  if (!conv || !conv.id || !token.value) return;
  const ok = await confirmModal({
    title: 'حذف گفتگو',
    message: 'آیا از حذف این مکالمه اطمینان دارید؟ تمامی پیام‌های این گفتگو پاک خواهند شد.',
    confirmText: 'حذف گفتگو',
    cancelText: 'انصراف',
    variant: 'danger',
  });
  if (!ok) return;
  try {
    await convs.deleteSelectedConversation(token.value, conv);
    delete messages[conv.user_id];
    toast.showToast('گفتگو حذف شد', 'success');
  } catch {
    toast.showToast('خطا در حذف مکالمه', 'error');
  }
}

async function onSelectNewChatUser(user: SearchUser) {
  showNewChatModal.value = false;
  if (!token.value) return;
  try {
    const created = await convs.startNewConversation(
      token.value,
      user.id,
      user.username,
      user.displayName,
      user.avatarUrl,
      user.isOnline
    );
    await onSelectConversation(created);
  } catch (err) {
    console.error('Error starting conversation:', err);
    toast.showToast('خطا در ایجاد مکالمه', 'error');
  }
}

function onGlobalClick() {
  msgs.closeMessageContextMenu();
  convs.closeConversationMenu();
}

let isAuthenticating = false;

async function onAuthenticated() {
  if (!token.value || !userId.value || isAuthenticating) return;
  isAuthenticating = true;

  try {
    // 1. Connect WebSocket right away so status updates immediately
    ws.connectWebSocket();

    // 2. Load conversations and profile in parallel
    await Promise.allSettled([
      convs.loadConversationsList(token.value, messages),
      auth.loadMyProfile(),
      call.loadWebRTCConfig(token.value),
    ]);

    // 3. Initialize E2EE in the background and hydrate encrypted previews
    e2ee
      .ensureE2EEReady(
        token.value,
        userId.value,
        auth.authPassword.value
      )
      .then(() => {
        if (token.value && userId.value) {
          convs.hydrateEncryptedConversationPreviews(
            token.value,
            messages,
            (mList) => e2ee.decryptMessageList(token.value!, userId.value!, mList)
          );
        }
      })
      .catch((err) => {
        console.warn('E2EE init error:', err);
      });
  } finally {
    isAuthenticating = false;
  }
}

watch(
  () => isAuthed.value,
  async (authed) => {
    if (authed) {
      await onAuthenticated();
    }
  }
);

function onLogout() {
  auth.clearAuth();
  convs.closeConversation();
  conversations.value = [];
  ws.closeWebSocket(true);
  e2ee.resetE2EEState();
}

function pushHistory(type: 'chat' | 'modal', name: string) {
  if (typeof window !== 'undefined') {
    window.history.pushState({ type, name, timestamp: Date.now() }, '');
  }
}

function handlePopState() {
  if (messageContextMenu.show || conversationMenu.show) {
    msgs.closeMessageContextMenu();
    convs.closeConversationMenu();
  }

  if (isProfileModalOpen.value) {
    isProfileModalOpen.value = false;
    return;
  }
  if (showNewChatModal.value) {
    showNewChatModal.value = false;
    return;
  }
  if (showRulesModal.value) {
    showRulesModal.value = false;
    return;
  }

  if (currentConversationId.value && !chatListOpen.value) {
    convs.closeConversation();
  }
}

function onBackFromChat() {
  if (typeof window !== 'undefined' && window.history.state?.type === 'chat') {
    window.history.back();
  } else {
    convs.closeConversation();
  }
}

function openProfileModal() {
  isProfileModalOpen.value = true;
  pushHistory('modal', 'profile');
}

function closeProfileModal() {
  if (typeof window !== 'undefined' && window.history.state?.type === 'modal') {
    window.history.back();
  } else {
    isProfileModalOpen.value = false;
  }
}

function openNewChatModal() {
  showNewChatModal.value = true;
  pushHistory('modal', 'new-chat');
}

function closeNewChatModal() {
  if (typeof window !== 'undefined' && window.history.state?.type === 'modal') {
    window.history.back();
  } else {
    showNewChatModal.value = false;
  }
}

// Lifecycle Hooks
onMounted(async () => {
  setUnauthorizedHandler(onLogout);
  window.addEventListener('click', onGlobalClick);
  window.addEventListener('popstate', handlePopState);
  await fetchAppVersion();

  if (isAuthed.value) {
    await onAuthenticated();
  }
});

onBeforeUnmount(() => {
  setUnauthorizedHandler(null);
  window.removeEventListener('click', onGlobalClick);
  window.removeEventListener('popstate', handlePopState);
  msgs.cleanupVoiceRecorder();
  ws.closeWebSocket(true);
});
</script>

<template>
  <div id="app">
    <!-- Unauthenticated Flow -->
    <AuthContainer
      v-if="!isAuthed"
      :app-version="appVersion"
      @authenticated="onAuthenticated"
    />

    <!-- Authenticated Messenger Flow -->
    <div class="messenger-wrapper" v-else>
      <!-- Global Active Call Banner -->
      <ActiveCallBar
        v-if="activeCall"
        :active-call="activeCall"
        :call-duration="callDuration"
        :chat-list-open="chatListOpen"
        :current-conversation-id="currentConversationId"
        :is-muted="isMuted"
        @return-to-chat="returnToActiveCallChat"
        @hangup="onHangupCall"
        @toggle-mute="call.toggleMute"
      />

      <div class="messenger-container">
        <!-- Left Panel: Chat List -->
        <ChatListPanel
          :chat-list-open="chatListOpen"
          :avatar-url="myAvatarUrl"
          :username="username"
          :display-name="profileDisplayName"
          :status-text="userProfileStatusText"
          :loading-conversations="loadingConversations"
          :filtered-conversations="filteredConversations"
          :current-conversation-id="currentConversationId"
          :messages-by-user="messages"
          :conversation-menu="conversationMenu"
          :show-new-chat-modal="showNewChatModal"
          :token="token"
          v-model:search-query="searchQuery"
          @open-profile="openProfileModal"
          @select-conversation="onSelectConversation"
          @open-conversation-menu="(ev, c) => convs.openConversationMenu(ev, c)"
          @delete-conversation="onDeleteConversation"
          @close-conversation-menu="convs.closeConversationMenu"
          @open-new-chat="openNewChatModal"
          @close-new-chat="closeNewChatModal"
          @select-new-chat-user="onSelectNewChatUser"
        />

        <!-- Right Panel: Active Chat -->
        <ChatPanel
          ref="chatPanelRef"
          :chat-list-open="chatListOpen"
          :conversation="currentConversation"
          :current-conversation-id="currentConversationId"
          :loading-messages="loadingMessages"
          :loading-older-messages="loadingOlderMessages"
          :has-more="hasMoreCurrent"
          :messages="currentMessages"
          :my-user-id="userId"
          :message-context-menu="messageContextMenu"
          :pull-to-refresh="pullToRefresh"
          v-model:message-text="messageText"
          :recording-voice="recordingVoice"
          :recording-elapsed-sec="recordingElapsedSec"
          :uploading-file="uploadingFile"
          :sending-voice="sendingVoice"
          @back="onBackFromChat"
          @start-call="onStartCall"
          @load-older="onLoadOlder"
          @open-message-menu="(ev, m) => msgs.openMessageContextMenu(ev, m, userId)"
          @close-message-menu="msgs.closeMessageContextMenu"
          @copy-message="onCopyMessage"
          @delete-message="onDeleteMessage"
          @send-message="onSendMessage"
          @select-file="onSelectFile"
          @toggle-voice="onToggleVoice"
          @cancel-voice="msgs.cleanupVoiceRecorder"
          @pull-start="onPullStart"
          @pull-move="onPullMove"
          @pull-end="onPullEnd"
        />
      </div>

      <!-- Profile & Settings Modal -->
      <ProfileModal
        :is-open="isProfileModalOpen"
        :app-version="appVersion"
        @close="closeProfileModal"
        @logout="onLogout"
      />

      <!-- Call Modals -->
      <IncomingCallModal
        v-if="incomingCall"
        :incoming-call="incomingCall"
        @accept="onAcceptCall"
        @reject="onRejectCall"
      />

      <OutgoingCallModal
        v-if="outgoingCall"
        :outgoing-call="outgoingCall"
        @cancel="onHangupCall"
      />
    </div>

    <!-- Global Toast & Confirmation Modal -->
    <ToastNotification />
    <ConfirmModal />
  </div>
</template>
