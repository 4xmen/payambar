import { nextTick, ref } from 'vue';
import { WS_URL } from '../services/api';
import { canConnect, createConnection, reconnectDelay, shouldReconnect } from '../services/ws';
import { updateMessageStatus } from '../services/funcs';
import { applyIncomingMessage } from '../services/messages';
import { findByUserId } from '../services/conversations';
import { useAuth } from './useAuth';
import { useConversations } from './useConversations';
import { useMessages } from './useMessages';
import { useCall } from './useCall';
import { useE2EE } from './useE2EE';
import { useToast } from './useToast';

export interface AppWebSocketOptions {
  onIncomingMessageScroll?: () => void;
}

const serverOffline = ref<boolean>(false);
const wsConnected = ref<boolean>(false);
const wsReconnectAttempts = ref<number>(0);
const wsMaxReconnectAttempts = 50;
const wsReconnectBaseDelay = 1000;
const wsReconnectMaxDelay = 30000;

let wsReconnectTimer: any = null;
let wsIntentionalClose = false;
let wsInstance: WebSocket | null = null;

export function useAppWebSocket(options?: AppWebSocketOptions) {
  const auth = useAuth();
  const convs = useConversations();
  const msgs = useMessages();
  const call = useCall();
  const e2ee = useE2EE();
  const toast = useToast();

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

  async function handleWebSocketMessage(data: any) {
    if (data.type === 'call_offer') {
      if (call.activeCall.value || call.incomingCall.value || call.outgoingCall.value) {
        sendWsJson({
          type: 'call_reject',
          receiver_id: Number(data.sender_id),
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

      call.setIncomingCall({
        sender_id: Number(data.sender_id),
        username: sender.username,
        displayName: sender.display_name,
        avatar_url: sender.avatar_url,
        offer: data.payload.offer,
      });

      // Notify caller that we are actively ringing
      sendWsJson({
        type: 'call_ringing',
        receiver_id: Number(data.sender_id),
      });

      if (call.pendingAutoAnswer.value) {
        call.pendingAutoAnswer.value = false;
        nextTick(() => {
          call.acceptCall(sendWsJson);
        });
      }
    } else if (data.type === 'call_ringing') {
      if (
        call.outgoingCall.value &&
        Number(call.outgoingCall.value.receiver_id) === Number(data.sender_id)
      ) {
        call.handleCallRinging();
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
        const isBusy = data.payload?.reason === 'busy';
        toast.showToast(isBusy ? 'کاربر در حال مکالمه است' : 'تماس رد شد');
        call.endCall({ isInitiator: false, sendWsMessage: sendWsJson });
      }
    } else if (data.type === 'call_hangup') {
      if (
        (call.activeCall.value && Number(call.activeCall.value.user_id) === Number(data.sender_id)) ||
        (call.incomingCall.value && Number(call.incomingCall.value.sender_id) === Number(data.sender_id)) ||
        (call.outgoingCall.value && Number(call.outgoingCall.value.receiver_id) === Number(data.sender_id))
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
      const isFromMe = senderId === Number(auth.userId.value);
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

      if (!isFromMe) {
        if (Number(convs.currentConversationId.value) === convUser) {
          sendWsJson({ type: 'mark_delivered', message_id: data.message_id });
          sendWsJson({ type: 'mark_read', message_id: data.message_id });
          nextTick(() => {
            options?.onIncomingMessageScroll?.();
          });
        } else {
          sendWsJson({ type: 'mark_delivered', message_id: data.message_id });
          convs.loadConversationsList(auth.token.value || '', msgs.messages);
        }
      } else {
        nextTick(() => {
          options?.onIncomingMessageScroll?.();
        });
      }
    } else if (data.type === 'status_update') {
      updateMessageStatus(msgs.messages, data.message_id, data.status);
    }
  }

  return {
    serverOffline,
    wsConnected,
    wsReconnectAttempts,
    wsMaxReconnectAttempts,
    connectWebSocket,
    closeWebSocket,
    sendWsJson,
  };
}
