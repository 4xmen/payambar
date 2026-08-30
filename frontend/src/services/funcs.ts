import type { Conversation, Message, SearchUser } from '../types';

export function isValidAuth(
  token: string | null | undefined,
  userId: string | number | null | undefined,
  username: string | null | undefined
): boolean {
  const isTokenValid = Boolean(token && token !== 'undefined' && token !== 'null');
  const parsedId = typeof userId === 'number' ? userId : parseInt(String(userId || ''), 10);
  const isUserIdValid = !isNaN(parsedId) && parsedId > 0;
  return Boolean(isTokenValid && isUserIdValid && username);
}

export function parseWebSocketMessage<T = unknown>(eventData: string): T | null {
  try {
    return JSON.parse(eventData) as T;
  } catch {
    return null;
  }
}

export function findExistingConversation(
  conversations: Conversation[],
  userId: number
): Conversation | undefined {
  return conversations.find((c) => Number(c.user_id) === Number(userId));
}

export function filterConversations(
  conversations: Conversation[],
  query: string
): Conversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter(
    (c) =>
      c.username?.toLowerCase().includes(q) ||
      c.display_name?.toLowerCase().includes(q)
  );
}

export function updateMessageStatus(
  messages: Record<number, Message[]>,
  messageId: number,
  newStatus: string
): boolean {
  const allMsgs = Object.values(messages).flat();
  const msg = allMsgs.find((m) => Number(m.id) === Number(messageId));
  if (msg) {
    msg.status = newStatus;
    return true;
  }
  return false;
}

export function addMessageToConversation(
  messages: Record<number, Message[]>,
  convUserId: number,
  message: Message
): void {
  if (!messages[convUserId]) {
    messages[convUserId] = [];
  }
  messages[convUserId].push(message);
}

export function replaceMessageByClientId(
  messages: Record<number, Message[]>,
  convUserId: number,
  clientMessageId: string,
  serverMessage: { message_id: number; status: string }
): boolean {
  if (!messages[convUserId]) return false;
  const idx = messages[convUserId].findIndex(
    (m) => m.client_message_id === clientMessageId
  );
  if (idx >= 0) {
    messages[convUserId][idx] = {
      ...messages[convUserId][idx],
      id: serverMessage.message_id,
      status: serverMessage.status,
    };
    return true;
  }
  return false;
}

/**
 * Relative Persian time formatting.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    if (value === '0001-01-01T00:00:00Z' || value.startsWith('0001-01-01')) {
      return '';
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    if (date.getFullYear() < 2000) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0 || diffMs > 10 * 365 * 24 * 60 * 60 * 1000) {
      return '';
    }

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });

    if (diffSeconds < 60) {
      return rtf.format(-diffSeconds, 'second');
    } else if (diffMinutes < 60) {
      return rtf.format(-diffMinutes, 'minute');
    } else if (diffHours < 24) {
      return rtf.format(-diffHours, 'hour');
    } else if (diffDays < 7) {
      return rtf.format(-diffDays, 'day');
    } else if (diffWeeks < 4) {
      return rtf.format(-diffWeeks, 'week');
    } else if (diffMonths < 12) {
      return rtf.format(-diffMonths, 'month');
    } else {
      return rtf.format(-diffYears, 'year');
    }
  } catch {
    return '';
  }
}

export function formatStatus(msg: { status?: string } | null | undefined): string {
  if (!msg) return '';
  if (msg.status === 'read') return '✓✓';
  if (msg.status === 'delivered') return '✓';
  return '';
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return toPersianDigits(`${hours}:${minutes}`);
  } catch {
    return '';
  }
}

export function formatRecordingDuration(seconds: number | string): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60).toString().padStart(2, '0');
  const secs = (total % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function getMessageFileName(msg: Partial<Message> | null | undefined): string {
  const fromName = (msg?.file_name || '').toLowerCase();
  if (fromName) return fromName;
  try {
    const url = String(msg?.file_url || '').split('?')[0];
    return url.toLowerCase();
  } catch {
    return '';
  }
}

export function isAudioMessage(msg: Partial<Message> | null | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  const fileName = getMessageFileName(msg);
  if (fileName.startsWith('voice-')) return true;
  const contentType =
    typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
  if (contentType.startsWith('audio/')) return true;
  return (
    fileName.endsWith('.webm') ||
    fileName.endsWith('.ogg') ||
    fileName.endsWith('.mp3') ||
    fileName.endsWith('.wav') ||
    fileName.endsWith('.m4a')
  );
}

export function isImageMessage(msg: Partial<Message> | null | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  const contentType =
    typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
  if (contentType.startsWith('image/')) return true;
  const fileName = getMessageFileName(msg);
  return (
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.png') ||
    fileName.endsWith('.gif') ||
    fileName.endsWith('.webp') ||
    fileName.endsWith('.bmp') ||
    fileName.endsWith('.svg')
  );
}

export function isVideoMessage(msg: Partial<Message> | null | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  if (isAudioMessage(msg)) return false;
  const contentType =
    typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
  if (contentType.startsWith('video/')) return true;
  const fileName = getMessageFileName(msg);
  return (
    fileName.endsWith('.mp4') ||
    fileName.endsWith('.webm') ||
    fileName.endsWith('.mov') ||
    fileName.endsWith('.m4v') ||
    fileName.endsWith('.mkv')
  );
}

export function getConversationPreview(
  conv: Conversation | null | undefined,
  messagesByUser?: Record<number, Message[]>
): string {
  if (!conv) return '';
  const localMessages = (messagesByUser && messagesByUser[conv.user_id]) || [];
  const latest = localMessages[localMessages.length - 1];
  if (latest?.file_name) return latest.file_name;
  if (latest?.file_url) return 'فایل';
  if (latest?.content) return latest.content.trim();
  if (typeof conv.last_message_preview === 'string' && conv.last_message_preview.trim()) {
    return conv.last_message_preview.trim();
  }
  return '';
}

export function shouldShowMessageStatus(
  msg: Message | null | undefined,
  index: number,
  messages: Message[] | undefined,
  userId: number | string | null | undefined
): boolean {
  if (!msg) return false;
  if (Number(msg.sender_id) !== Number(userId)) return false;
  const list = messages || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (Number(list[i]?.sender_id) === Number(userId)) {
      return i === index;
    }
  }
  return false;
}

export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function getConversationLastTimestamp(
  conv: Conversation | null | undefined,
  messagesByUser?: Record<number, Message[]>
): number {
  if (!conv) return 0;
  const fromConversation = parseTimestamp(conv.last_message_at);
  const localMessages = (messagesByUser && messagesByUser[conv.user_id]) || [];
  let localMax = 0;
  for (const msg of localMessages) {
    const ts = parseTimestamp(msg?.created_at);
    if (ts > localMax) localMax = ts;
  }
  return Math.max(fromConversation, localMax);
}

export function sortConversations(
  conversations: Conversation[],
  messagesByUser?: Record<number, Message[]>
): Conversation[] {
  return [...conversations].sort(
    (a, b) =>
      getConversationLastTimestamp(b, messagesByUser) -
      getConversationLastTimestamp(a, messagesByUser)
  );
}

export function sortConversationsInPlace(
  conversations: Conversation[],
  messagesByUser?: Record<number, Message[]>
): Conversation[] {
  conversations.sort(
    (a, b) =>
      getConversationLastTimestamp(b, messagesByUser) -
      getConversationLastTimestamp(a, messagesByUser)
  );
  return conversations;
}

export function normalizeSearchUser(user: any): SearchUser {
  const username = typeof user?.username === 'string' ? user.username : '';
  const displayName = typeof user?.display_name === 'string' ? user.display_name : '';
  return {
    id: Number(user?.id) || 0,
    username,
    displayName,
    avatarUrl: typeof user?.avatar_url === 'string' ? user.avatar_url : '',
    isOnline: Boolean(user?.is_online),
    nameLabel: displayName || username || '?',
  };
}
