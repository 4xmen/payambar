<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Conversation, Message, SearchUser } from './types';
import { API_URL, WS_URL } from './services/api';
import { canConnect, createConnection, reconnectDelay, shouldReconnect } from './services/ws';
import { updateMessageStatus } from './services/funcs';
import { applyIncomingMessage, unreadIncomingIds } from './services/messages';
import { findByUserId } from './services/conversations';

import { useAuth } from './composables/useAuth';
import { useConversations } from './composables/useConversations';
import { useMessages } from './composables/useMessages';
import { useCall } from './composables/useCall';
import { useE2EE } from './composables/useE2EE';
import { useToast } from './composables/useToast';

import AuthContainer from './components/auth/AuthContainer.vue';
import ProfileModal from './components/profile/ProfileModal.vue';
import ChatListPanel from './components/chat/ChatListPanel.vue';
import ChatPanel from './components/chat/ChatPanel.vue';
import ActiveCallBar from './components/call/ActiveCallBar.vue';
import IncomingCallModal from './components/call/IncomingCallModal.vue';
import OutgoingCallModal from './components/call/OutgoingCallModal.vue';
import ToastNotification from './components/ui/ToastNotification.vue';

// Composables
const auth = useAuth();
const convs = useConversations();
const msgs = useMessages();
const call = useCall();
const e2ee = useE2EE();
const toast = useToast();

const appVersion = ref<string>('');
const isProfileModalOpen = ref<boolean>(false);

// Network / WebSocket State
const isOffline = ref<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
const serverOffline = ref<boolean>(false);
const wsConnected = ref<boolean>(false);
const wsReconnectAttempts = ref<number>(0);
const wsMaxReconnectAttempts = 50;
const wsReconnectBaseDelay = 1000;
const wsReconnectMaxDelay = 30000;
let wsReconnectTimer: any = null;
let wsIntentionalClose = false;
let wsInstance: WebSocket | null = null;

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null);

const userProfileStatusText = computed<string>(() => {
  if (!auth.isAuthed.value) return '';
  if (wsConnected.value) return 'آنلاین';
  if (isOffline.value) return 'آفلاین';
  if (wsReconnectAttempts.value >= wsMaxReconnectAttempts) return 'آفلاین';
  return 'در حال اتصال...';
});

const currentMessages = computed<Message[]>(() => {
  return msgs.getMessagesForUser(convs.currentConversationId.value);
});

const hasMoreCurrent = computed<boolean>(() => {
  if (!convs.currentConversationId.value) return false;
  return Boolean(msgs.hasMoreMessages[convs.currentConversationId.value]);
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

// WebSocket Connection
function sendWsJson(payload: Record<string, unknown>) {
  if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify(payload));
  }
}

function closeWebSocket(intentional = true) {
  wsIntentionalClose = intentional;
  wsConnected.value = false;
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsInstance) {
    try {
      wsInstance.close();
    } catch {}
    wsInstance = null;
  }
  if (intentional) {
    wsReconnectAttempts.value = 0;
    serverOffline.value = false;
  }
}

function connectWebSocket() {
  if (
    !canConnect({
      isAuthed: auth.isAuthed.value,
      token: auth.token.value,
      existingWs: wsInstance,
    })
  ) {
    return;
  }
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  wsIntentionalClose = false;
  wsConnected.value = false;

  wsInstance = createConnection({
    wsUrl: WS_URL,
    token: auth.token.value!,
    onOpen: () => {
      wsReconnectAttempts.value = 0;
      serverOffline.value = false;
      wsConnected.value = true;
    },
    onMessage: (data) => {
      handleWebSocketMessage(data);
    },
    onError: () => {
      if (!auth.isAuthed.value || wsIntentionalClose) return;
      serverOffline.value = true;
      wsConnected.value = false;
    },
    onClose: () => {
      const intentionalClose = wsIntentionalClose;
      wsInstance = null;
      wsConnected.value = false;
      if (
        !shouldReconnect({
          isAuthed: auth.isAuthed.value,
          intentionalClose: intentionalClose || !auth.isAuthed.value,
          attempts: wsReconnectAttempts.value,
          maxAttempts: wsMaxReconnectAttempts,
        })
      ) {
        if (intentionalClose || !auth.isAuthed.value) {
          wsIntentionalClose = false;
        }
        if (!intentionalClose && auth.isAuthed.value) {
          serverOffline.value = true;
        }
        return;
      }
      serverOffline.value = true;
      wsReconnectAttempts.value++;
      const delay = reconnectDelay(
        wsReconnectAttempts.value,
        wsReconnectBaseDelay,
        wsReconnectMaxDelay
      );
      wsReconnectTimer = setTimeout(() => {
        wsReconnectTimer = null;
        connectWebSocket();
      }, delay);
    },
  });
}

// WebSocket incoming event handler
async function handleWebSocketMessage(data: any) {
  if (data.type === 'call_offer') {
    if (call.activeCall.value || call.incomingCall.value || call.outgoingCall.value) {
      sendWsJson({
        type: 'call_reject',
        receiver_id: data.sender_id,
        payload: { reason: 'busy' },
      });
      return;
    }
    const found = findByUserId(convs.conversations.value, data.sender_id);
    const sender = found || {
      id: 0,
      username: 'کاربر',
      user_id: data.sender_id,
      display_name: '',
      avatar_url: null,
    };

    call.incomingCall.value = {
      sender_id: Number(data.sender_id),
      username: sender.username,
      displayName: sender.display_name,
      avatar_url: sender.avatar_url,
      offer: data.payload.offer,
    };

    if (call.pendingAutoAnswer.value) {
      call.pendingAutoAnswer.value = false;
      nextTick(() => {
        call.acceptCall(sendWsJson);
      });
    }
  } else if (data.type === 'call_answer') {
    if (
      call.outgoingCall.value &&
      Number(call.outgoingCall.value.receiver_id) === Number(data.sender_id)
    ) {
      await call.handleCallAnswer(data.payload.answer);
    }
  } else if (data.type === 'ice_candidate') {
    await call.handleIncomingIceCandidate(data.payload?.candidate);
  } else if (data.type === 'call_reject') {
    if (
      call.outgoingCall.value &&
      Number(call.outgoingCall.value.receiver_id) === Number(data.sender_id)
    ) {
      alert('تماس رد شد');
      call.endCall({ isInitiator: false, sendWsMessage: sendWsJson });
    }
  } else if (data.type === 'call_hangup') {
    if (
      (call.activeCall.value && Number(call.activeCall.value.user_id) === Number(data.sender_id)) ||
      (call.incomingCall.value && Number(call.incomingCall.value.sender_id) === Number(data.sender_id))
    ) {
      call.endCall({ isInitiator: false, sendWsMessage: sendWsJson });
    }
  } else if (data.type === 'message') {
    const normalizedMessage = await e2ee.maybeDecryptMessage(
      auth.token.value || '',
      auth.userId.value || 0,
      data
    );
    const incomingContent = normalizedMessage.content;
    const senderId = Number(data.sender_id);
    const { convUser } = applyIncomingMessage(
      msgs.messages,
      auth.userId.value || 0,
      data,
      incomingContent
    );

    convs.updateConversationLastMessage(
      convUser,
      data.created_at || new Date().toISOString(),
      msgs.messages
    );

    if (Number(convs.currentConversationId.value) === convUser) {
      sendWsJson({ type: 'mark_delivered', message_id: data.message_id });
      sendWsJson({ type: 'mark_read', message_id: data.message_id });
      nextTick(() => {
        chatPanelRef.value?.scrollToBottom();
      });
    } else if (senderId !== Number(auth.userId.value)) {
      convs.loadConversationsList(auth.token.value || '', msgs.messages);
    }
  } else if (data.type === 'status_update') {
    updateMessageStatus(msgs.messages, data.message_id, data.status);
  }
}

// Conversation Selection and Message Loading
async function onSelectConversation(conv: Conversation) {
  convs.selectConversation(conv);
  pushHistory('chat', String(conv.user_id));
  const loaded = await msgs.loadConversationMessages(
    auth.token.value || '',
    conv.user_id,
    (mList) => e2ee.decryptMessageList(auth.token.value || '', auth.userId.value || 0, mList)
  );

  const latest = loaded.length ? loaded[loaded.length - 1] : null;
  if (latest?.created_at) {
    convs.updateConversationLastMessage(conv.user_id, latest.created_at, msgs.messages);
  }

  if (wsConnected.value) {
    for (const msgId of unreadIncomingIds(loaded, auth.userId.value || 0)) {
      sendWsJson({ type: 'mark_read', message_id: msgId });
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
  const content = (msgs.messageText.value || '').trim();
  if (
    !content ||
    !convs.currentConversationId.value ||
    !auth.userId.value ||
    !auth.token.value ||
    !wsConnected.value
  ) {
    return;
  }

  const receiverId = Number(convs.currentConversationId.value);
  const clientMessageId = `client-${Date.now()}`;

  const optimistic = msgs.sendTextMessageOptimistic({
    myUserId: auth.userId.value,
    receiverId,
    content,
    clientMessageId,
  });

  convs.updateConversationLastMessage(receiverId, optimistic.created_at, msgs.messages);
  msgs.messageText.value = '';
  convs.chatListOpen.value = false;

  let encryptedPayload: any = null;
  try {
    encryptedPayload = await e2ee.encryptTextMessage(auth.token.value, receiverId, content);
  } catch (err) {
    console.warn('Encryption error, sending plaintext:', err);
  }

  if (e2ee.e2ee.enabled && !encryptedPayload && !e2ee.e2ee.noKeyWarnedRecipients[receiverId]) {
    alert('ارسال امن ممکن نیست؛ کلید مخاطب در دسترس نیست. پیام به صورت غیر رمزنگاری‌شده ارسال می‌شود.');
    e2ee.e2ee.noKeyWarnedRecipients[receiverId] = true;
  }

  const payload = {
    type: 'message',
    receiver_id: receiverId,
    content: encryptedPayload ? '' : content,
    client_message_id: clientMessageId,
    ...(encryptedPayload || {}),
  };

  sendWsJson(payload);

  nextTick(() => {
    chatPanelRef.value?.scrollToBottom();
    chatPanelRef.value?.focusInput();
  });
}

async function onSelectFile(file: File) {
  if (!convs.currentConversationId.value || !auth.token.value || !auth.userId.value) return;
  const receiverId = Number(convs.currentConversationId.value);
  const msg = await msgs.uploadFileMessage({
    token: auth.token.value,
    receiverId,
    myUserId: auth.userId.value,
    file,
    isWsOpen: wsConnected.value,
  });
  if (msg) {
    convs.updateConversationLastMessage(receiverId, msg.created_at, msgs.messages);
    nextTick(() => chatPanelRef.value?.scrollToBottom());
  }
  convs.loadConversationsList(auth.token.value, msgs.messages);
}

async function onToggleVoice() {
  if (!convs.currentConversationId.value || msgs.uploadingFile.value || msgs.sendingVoice.value) {
    return;
  }
  if (msgs.recordingVoice.value) {
    msgs.stopVoiceRecordingAndSend(async (file) => {
      await onSelectFile(file);
    });
    return;
  }
  await msgs.startVoiceRecording();
}

async function onLoadOlder() {
  if (
    !convs.currentConversationId.value ||
    !auth.token.value ||
    msgs.loadingOlderMessages.value
  ) {
    return;
  }
  const container = chatPanelRef.value?.getContainerEl?.();
  const oldScrollHeight = container ? container.scrollHeight : 0;
  const oldScrollTop = container ? container.scrollTop : 0;

  const older = await msgs.loadOlderMessages(
    auth.token.value,
    convs.currentConversationId.value,
    (mList) => e2ee.decryptMessageList(auth.token.value || '', auth.userId.value || 0, mList)
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
  if (!convs.currentConversationId.value || !auth.token.value) return;
  const convUserId = convs.currentConversationId.value;
  const container = chatPanelRef.value?.getContainerEl?.() || null;
  const wasNearBottom = msgs.isNearBottom(container);

  const loaded = await msgs.loadConversationMessages(
    auth.token.value,
    convUserId,
    (mList) => e2ee.decryptMessageList(auth.token.value || '', auth.userId.value || 0, mList)
  );
  const latest = loaded.length ? loaded[loaded.length - 1] : null;
  if (latest?.created_at) {
    convs.updateConversationLastMessage(convUserId, latest.created_at, msgs.messages);
  }

  if (!options.keepScroll || wasNearBottom) {
    nextTick(() => {
      chatPanelRef.value?.scrollToBottom();
    });
  }
}

function onPullStart(event: TouchEvent | MouseEvent) {
  const container = chatPanelRef.value?.getContainerEl?.() || null;
  msgs.handlePullStart(event, container, convs.currentConversationId.value);
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
  if (!convs.currentConversation.value) return;
  const c = convs.currentConversation.value;
  call.startCall({
    receiverId: c.user_id,
    username: c.username,
    displayName: c.display_name,
    avatarUrl: c.avatar_url,
    sendWsMessage: sendWsJson,
  });
}

function onAcceptCall() {
  call.acceptCall(sendWsJson);
}

function onRejectCall() {
  call.rejectCall(sendWsJson, (otherUserId, logText) => {
    sendWsJson({ type: 'message', receiver_id: otherUserId, content: logText });
  });
}

function onHangupCall() {
  call.endCall({
    isInitiator: true,
    sendWsMessage: sendWsJson,
    onSaveCallLog: (otherUserId, logText) => {
      sendWsJson({ type: 'message', receiver_id: otherUserId, content: logText });
    },
  });
}

function returnToActiveCallChat() {
  if (!call.activeCall.value) return;
  const targetId = Number(call.activeCall.value.user_id);
  const target = findByUserId(convs.conversations.value, targetId) || {
    id: 0,
    user_id: targetId,
    username: call.activeCall.value.username,
    display_name: call.activeCall.value.displayName,
    avatar_url: call.activeCall.value.avatar_url,
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
  if (!msg.id || !convs.currentConversationId.value || !auth.token.value) return;
  if (!confirm('آیا از حذف این پیام اطمینان دارید؟')) return;
  try {
    await msgs.deleteMessageById(auth.token.value, convs.currentConversationId.value, msg.id);
  } catch {
    alert('خطا در حذف پیام');
  }
}

async function onDeleteConversation(conv: Conversation) {
  convs.closeConversationMenu();
  if (!conv || !conv.id || !auth.token.value) return;
  if (!confirm('آیا از حذف این مکالمه اطمینان دارید؟')) return;
  try {
    await convs.deleteSelectedConversation(auth.token.value, conv);
    delete msgs.messages[conv.user_id];
  } catch {
    alert('خطا در حذف مکالمه');
  }
}

async function onSelectNewChatUser(user: SearchUser) {
  convs.showNewChatModal.value = false;
  if (!auth.token.value) return;
  try {
    const created = await convs.startNewConversation(
      auth.token.value,
      user.id,
      user.username,
      user.displayName,
      user.avatarUrl,
      user.isOnline
    );
    await onSelectConversation(created);
  } catch (err) {
    console.error('Error starting conversation:', err);
    alert('خطا در ایجاد مکالمه');
  }
}

function onGlobalClick() {
  msgs.closeMessageContextMenu();
  convs.closeConversationMenu();
}

async function onAuthenticated() {
  if (!auth.token.value || !auth.userId.value) return;

  // 1. Connect WebSocket right away so status updates immediately
  connectWebSocket();

  // 2. Load conversations and profile in parallel
  await Promise.allSettled([
    convs.loadConversationsList(auth.token.value, msgs.messages),
    auth.loadMyProfile(),
    call.loadWebRTCConfig(auth.token.value),
  ]);

  // 3. Initialize E2EE in the background
  e2ee
    .ensureE2EEReady(
      auth.token.value,
      auth.userId.value,
      auth.authPassword.value
    )
    .catch((err) => {
      console.warn('E2EE init error:', err);
    });
}

watch(
  () => auth.isAuthed.value,
  async (authed) => {
    if (authed) {
      await onAuthenticated();
    }
  }
);

function onLogout() {
  auth.clearAuth();
  convs.closeConversation();
  convs.conversations.value = [];
  closeWebSocket(true);
  e2ee.resetE2EEState();
}

function pushHistory(type: 'chat' | 'modal', name: string) {
  if (typeof window !== 'undefined') {
    window.history.pushState({ type, name, timestamp: Date.now() }, '');
  }
}

function handlePopState() {
  if (msgs.messageContextMenu.show || convs.conversationMenu.show) {
    msgs.closeMessageContextMenu();
    convs.closeConversationMenu();
  }

  if (isProfileModalOpen.value) {
    isProfileModalOpen.value = false;
    return;
  }
  if (convs.showNewChatModal.value) {
    convs.showNewChatModal.value = false;
    return;
  }
  if (auth.showRulesModal.value) {
    auth.showRulesModal.value = false;
    return;
  }

  if (convs.currentConversationId.value && !convs.chatListOpen.value) {
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
  convs.showNewChatModal.value = true;
  pushHistory('modal', 'new-chat');
}

function closeNewChatModal() {
  if (typeof window !== 'undefined' && window.history.state?.type === 'modal') {
    window.history.back();
  } else {
    convs.showNewChatModal.value = false;
  }
}

// Lifecycle Hooks
onMounted(async () => {
  window.addEventListener('click', onGlobalClick);
  window.addEventListener('popstate', handlePopState);
  await fetchAppVersion();
  const session = auth.initAuth();

  if (session) {
    await onAuthenticated();
  }

  window.addEventListener('online', () => {
    isOffline.value = false;
    serverOffline.value = false;
    if (auth.isAuthed.value && auth.token.value) {
      convs.loadConversationsList(auth.token.value, msgs.messages);
      connectWebSocket();
    }
  });

  window.addEventListener('offline', () => {
    isOffline.value = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.isAuthed.value && auth.token.value) {
      convs.loadConversationsList(auth.token.value, msgs.messages);
      connectWebSocket();
    }
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClick);
  window.removeEventListener('popstate', handlePopState);
  msgs.cleanupVoiceRecorder();
  closeWebSocket(true);
});
</script>

<template>
  <div id="app">
    <!-- Unauthenticated Flow -->
    <AuthContainer
      v-if="!auth.isAuthed.value"
      :app-version="appVersion"
      @authenticated="onAuthenticated"
    />

    <!-- Authenticated Messenger Flow -->
    <div class="messenger-wrapper" v-else>
      <!-- Global Active Call Banner -->
      <ActiveCallBar
        v-if="call.activeCall.value"
        :active-call="call.activeCall.value"
        :call-duration="call.callDuration.value"
        :chat-list-open="convs.chatListOpen.value"
        :current-conversation-id="convs.currentConversationId.value"
        @return-to-chat="returnToActiveCallChat"
        @hangup="onHangupCall"
      />

      <div class="messenger-container">
        <!-- Left Panel: Chat List -->
        <ChatListPanel
          :chat-list-open="convs.chatListOpen.value"
          :avatar-url="auth.myAvatarUrl.value"
          :username="auth.username.value"
          :display-name="auth.profileDisplayName.value"
          :status-text="userProfileStatusText"
          :loading-conversations="convs.loadingConversations.value"
          :filtered-conversations="convs.filteredConversations.value"
          :current-conversation-id="convs.currentConversationId.value"
          :messages-by-user="msgs.messages"
          :conversation-menu="convs.conversationMenu"
          :show-new-chat-modal="convs.showNewChatModal.value"
          :token="auth.token.value"
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
          :chat-list-open="convs.chatListOpen.value"
          :conversation="convs.currentConversation.value"
          :current-conversation-id="convs.currentConversationId.value"
          :loading-messages="msgs.loadingMessages.value"
          :loading-older-messages="msgs.loadingOlderMessages.value"
          :has-more="hasMoreCurrent"
          :messages="currentMessages"
          :my-user-id="auth.userId.value"
          :message-context-menu="msgs.messageContextMenu"
          :pull-to-refresh="msgs.pullToRefresh"
          v-model:message-text="msgs.messageText.value"
          :recording-voice="msgs.recordingVoice.value"
          :recording-elapsed-sec="msgs.recordingElapsedSec.value"
          :uploading-file="msgs.uploadingFile.value"
          :sending-voice="msgs.sendingVoice.value"
          @back="onBackFromChat"
          @start-call="onStartCall"
          @load-older="onLoadOlder"
          @open-message-menu="(ev, m) => msgs.openMessageContextMenu(ev, m, auth.userId.value)"
          @close-message-menu="msgs.closeMessageContextMenu"
          @copy-message="onCopyMessage"
          @delete-message="onDeleteMessage"
          @send-message="onSendMessage"
          @select-file="onSelectFile"
          @toggle-voice="onToggleVoice"
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
        v-if="call.incomingCall.value"
        :incoming-call="call.incomingCall.value"
        @accept="onAcceptCall"
        @reject="onRejectCall"
      />

      <OutgoingCallModal
        v-if="call.outgoingCall.value"
        :outgoing-call="call.outgoingCall.value"
        @cancel="onHangupCall"
      />
    </div>

    <!-- Global Toast -->
    <ToastNotification />
  </div>
</template>
