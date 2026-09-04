import { reactive, ref } from 'vue';
import type { Message, PullToRefreshState } from '../types';
import { API_URL, authHeaders, handleUnauthorized } from '../services/api';
import { useToast } from './useToast';
import {
  buildOfflineFileMessage,
  buildOptimisticTextMessage,
  deleteMessage as deleteMessageApi,
  fetchMessages,
  hasMoreMessages as hasMoreHelper,
  removeMessageById as removeMessageByIdHelper,
  upsertOfflineFileMessage,
} from '../services/messages';

const messages = reactive<Record<number, Message[]>>({});
const loadingMessages = ref<boolean>(false);
const loadingOlderMessages = ref<boolean>(false);
const hasMoreMessages = reactive<Record<number, boolean>>({});
const messageText = ref<string>('');
const uploadingFile = ref<boolean>(false);
const recordingVoice = ref<boolean>(false);
const recordingElapsedSec = ref<number>(0);
const sendingVoice = ref<boolean>(false);

let recordingTimer: any = null;
let recordingStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

const messageContextMenu = reactive<{
  show: boolean;
  x: number;
  y: number;
  message: Message | null;
}>({
  show: false,
  x: 0,
  y: 0,
  message: null,
});

const pullToRefresh = reactive<PullToRefreshState>({
  startY: 0,
  currentY: 0,
  pulling: false,
  refreshing: false,
  threshold: 80,
  ready: false,
});

export function useMessages() {
  function getMessagesForUser(userId: number | null): Message[] {
    if (!userId) return [];
    return messages[userId] || [];
  }

  async function loadConversationMessages(
    token: string,
    convUserId: number,
    decryptFn?: (messages: Message[]) => Promise<Message[]>
  ): Promise<Message[]> {
    loadingMessages.value = true;
    try {
      const res = await fetchMessages(API_URL, token, {
        userId: convUserId,
        limit: 50,
      });
      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorized();
        }
        messages[convUserId] = [];
        return [];
      }
      const data = await res.json();
      const rawMessages: Message[] = data.messages || [];
      const decrypted = decryptFn ? await decryptFn(rawMessages) : rawMessages;
      messages[convUserId] = decrypted;
      hasMoreMessages[convUserId] = hasMoreHelper(rawMessages);
      return decrypted;
    } catch (err) {
      console.error('Failed to load messages:', err);
      messages[convUserId] = [];
      return [];
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadOlderMessages(
    token: string,
    convUserId: number,
    decryptFn?: (messages: Message[]) => Promise<Message[]>
  ): Promise<Message[]> {
    if (loadingOlderMessages.value) return [];
    const currentList = messages[convUserId] || [];
    if (currentList.length === 0) return [];

    loadingOlderMessages.value = true;
    try {
      const offset = currentList.length;
      const res = await fetchMessages(API_URL, token, {
        userId: convUserId,
        limit: 50,
        offset,
      });
      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorized();
        }
        return [];
      }

      const data = await res.json();
      const rawMessages: Message[] = data.messages || [];
      const olderDecrypted = decryptFn ? await decryptFn(rawMessages) : rawMessages;

      if (olderDecrypted.length > 0) {
        messages[convUserId] = [...olderDecrypted, ...currentList];
      }
      hasMoreMessages[convUserId] = hasMoreHelper(rawMessages);
      return olderDecrypted;
    } catch (err) {
      console.error('Error loading older messages:', err);
      return [];
    } finally {
      loadingOlderMessages.value = false;
    }
  }

  function sendTextMessageOptimistic({
    myUserId,
    receiverId,
    content,
    clientMessageId,
  }: {
    myUserId: number;
    receiverId: number;
    content: string;
    clientMessageId: string;
  }): Message {
    const msg = buildOptimisticTextMessage({
      userId: myUserId,
      receiverId,
      content,
      clientMessageId,
    });
    if (!messages[receiverId]) {
      messages[receiverId] = [];
    }
    messages[receiverId].push(msg);
    return msg;
  }

  async function uploadFileMessage({
    token,
    receiverId,
    myUserId,
    file,
    isWsOpen,
  }: {
    token: string;
    receiverId: number;
    myUserId: number;
    file: File;
    isWsOpen: boolean;
  }): Promise<Message | null> {
    uploadingFile.value = true;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiver_id', String(receiverId));

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: authHeaders(token),
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const messageID = Number(data.message_id);

      if (!isWsOpen) {
        const createdAt = new Date().toISOString();
        const msg = buildOfflineFileMessage({
          messageId: messageID,
          userId: myUserId,
          receiverId,
          fileName: data.file_name,
          fileUrl: data.file_url,
          fileContentType: data.file_content_type || file.type || '',
          createdAt,
        });
        upsertOfflineFileMessage(messages, receiverId, msg);
        return msg;
      }
      return null;
    } catch (err) {
      console.error('File upload error:', err);
      useToast().showToast('خطا در آپلود فایل', 'error');
      return null;
    } finally {
      uploadingFile.value = false;
    }
  }

  function cleanupVoiceRecorder() {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder = null;
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach((track) => track.stop());
      recordingStream = null;
    }
    recordedChunks = [];
    recordingVoice.value = false;
    recordingElapsedSec.value = 0;
  }

  async function startVoiceRecording(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);

      recordedChunks = [];
      recordingStream = stream;
      mediaRecorder = recorder;
      recordingVoice.value = true;
      recordingElapsedSec.value = 0;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      recorder.start(250);
      recordingTimer = setInterval(() => {
        recordingElapsedSec.value += 1;
      }, 1000);
      return true;
    } catch (err) {
      console.error('Voice recording error:', err);
      useToast().showToast('دسترسی میکروفون لازم است', 'error');
      cleanupVoiceRecorder();
      return false;
    }
  }

  function stopVoiceRecordingAndSend(onAudioFileReady: (file: File) => Promise<void>) {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    recordingVoice.value = false;

    mediaRecorder.onstop = async () => {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      cleanupVoiceRecorder();

      if (blob.size === 0) return;
      sendingVoice.value = true;
      const extension = mimeType.includes('ogg')
        ? 'ogg'
        : mimeType.includes('mp4') || mimeType.includes('m4a')
          ? 'm4a'
          : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
      try {
        await onAudioFileReady(file);
      } finally {
        sendingVoice.value = false;
      }
    };

    mediaRecorder.stop();
  }

  async function deleteMessageById(
    token: string,
    convUserId: number,
    messageId: number
  ): Promise<boolean> {
    const res = await deleteMessageApi(API_URL, token, messageId);
    if (!res.ok) throw new Error('Delete failed');
    removeMessageByIdHelper(messages, convUserId, messageId);
    return true;
  }

  function openMessageContextMenu(event: MouseEvent, msg: Message, myUserId: number | null) {
    const targetRect = (event.currentTarget as HTMLElement)?.getBoundingClientRect();
    const padding = 12;
    const menuWidth = 160;
    const menuHeight = Number(msg.sender_id) === Number(myUserId) ? 104 : 56;

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

    messageContextMenu.show = true;
    messageContextMenu.x = x;
    messageContextMenu.y = y;
    messageContextMenu.message = msg;
  }

  function closeMessageContextMenu() {
    messageContextMenu.show = false;
    messageContextMenu.message = null;
  }

  function getPullBottomAllowance(el: HTMLElement | null): number {
    if (!el || typeof window === 'undefined') return 12;
    const style = window.getComputedStyle(el);
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    return paddingBottom + 24;
  }

  function isNearBottom(el: HTMLElement | null): boolean {
    if (!el) return false;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const allowance = getPullBottomAllowance(el);
    return distanceFromBottom <= allowance + 160;
  }

  function handlePullStart(
    event: TouchEvent | MouseEvent,
    containerEl: HTMLElement | null,
    currentConversationId: number | null
  ) {
    if (!currentConversationId || pullToRefresh.refreshing) return;
    if (!isNearBottom(containerEl)) return;
    pullToRefresh.ready = true;

    const touch = 'touches' in event && event.touches ? event.touches[0] : (event as MouseEvent);
    pullToRefresh.startY = touch.clientY;
    pullToRefresh.pulling = true;
  }

  function handlePullMove(event: TouchEvent | MouseEvent) {
    if (!pullToRefresh.pulling || pullToRefresh.refreshing) return;

    const touch = 'touches' in event && event.touches ? event.touches[0] : (event as MouseEvent);
    const deltaY = touch.clientY - pullToRefresh.startY;

    // Only pull up when at bottom
    if (deltaY < 0) {
      const magnitude = Math.abs(deltaY);
      pullToRefresh.currentY = Math.min(magnitude, pullToRefresh.threshold * 1.5);
      if (magnitude > 10 && event.cancelable) {
        event.preventDefault();
      }
    } else {
      pullToRefresh.currentY = 0;
    }
  }

  async function handlePullEnd(onRefresh: () => Promise<void>) {
    if (!pullToRefresh.pulling) return;

    if (pullToRefresh.currentY >= pullToRefresh.threshold) {
      pullToRefresh.refreshing = true;
      try {
        await onRefresh();
      } finally {
        pullToRefresh.refreshing = false;
      }
    }

    pullToRefresh.pulling = false;
    pullToRefresh.startY = 0;
    pullToRefresh.currentY = 0;
  }

  return {
    messages,
    loadingMessages,
    loadingOlderMessages,
    hasMoreMessages,
    messageText,
    uploadingFile,
    recordingVoice,
    recordingElapsedSec,
    sendingVoice,
    messageContextMenu,
    pullToRefresh,
    getMessagesForUser,
    loadConversationMessages,
    loadOlderMessages,
    sendTextMessageOptimistic,
    uploadFileMessage,
    startVoiceRecording,
    stopVoiceRecordingAndSend,
    cleanupVoiceRecorder,
    deleteMessageById,
    openMessageContextMenu,
    closeMessageContextMenu,
    handlePullStart,
    handlePullMove,
    handlePullEnd,
    isNearBottom,
  };
}
