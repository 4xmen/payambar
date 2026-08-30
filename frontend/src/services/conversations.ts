import type { Conversation, Message } from '../types';
import { authHeaders } from './api';
import { getConversationPreview } from './funcs';

export const ENCRYPTED_PREVIEW_PLACEHOLDER = 'پیام رمزنگاری شده';

export async function fetchConversations(
  apiUrl: string,
  token: string,
  fetchFn?: typeof fetch
): Promise<Response> {
  const doFetch = fetchFn || fetch;
  return doFetch(`${apiUrl}/conversations`, {
    headers: authHeaders(token),
  });
}

export async function createConversation(
  apiUrl: string,
  token: string,
  participantId: number,
  fetchFn?: typeof fetch
): Promise<Conversation> {
  const doFetch = fetchFn || fetch;
  const res = await doFetch(`${apiUrl}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ participant_id: participantId }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function deleteConversation(
  apiUrl: string,
  token: string,
  conversationId: number,
  fetchFn?: typeof fetch
): Promise<Response> {
  const doFetch = fetchFn || fetch;
  return doFetch(`${apiUrl}/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export function findByUserId(
  conversations: Conversation[],
  userId: number
): Conversation | undefined {
  return conversations.find((c) => Number(c.user_id) === Number(userId));
}

export function updateLastMessageAt(
  conversations: Conversation[],
  userId: number,
  timestamp: string
): boolean {
  if (!userId || !timestamp) return false;
  const idx = conversations.findIndex((c) => Number(c.user_id) === Number(userId));
  if (idx === -1) return false;
  conversations[idx].last_message_at = timestamp;
  return true;
}

export function bumpUnreadCount(
  conversations: Conversation[],
  userId: number
): boolean {
  const idx = conversations.findIndex((c) => Number(c.user_id) === Number(userId));
  if (idx === -1) return false;
  conversations[idx].unread_count = (conversations[idx].unread_count || 0) + 1;
  return true;
}

export function clearUnreadCount(
  conversations: Conversation[],
  userId: number
): boolean {
  const idx = conversations.findIndex((c) => Number(c.user_id) === Number(userId));
  if (idx === -1) return false;
  conversations[idx].unread_count = 0;
  return true;
}

export function needsEncryptedPreviewHydration(
  conv: Conversation | null | undefined,
  messagesByUser?: Record<number, Message[]>
): boolean {
  const preview = (conv?.last_message_preview || '').trim();
  if (preview !== ENCRYPTED_PREVIEW_PLACEHOLDER) return false;
  const localPreview = getConversationPreview(
    conv ? { ...conv, last_message_preview: '' } : null,
    messagesByUser
  );
  return !localPreview;
}

export function conversationsNeedingPreviewHydration(
  conversations: Conversation[],
  messagesByUser?: Record<number, Message[]>
): Conversation[] {
  return (conversations || []).filter((conv) =>
    needsEncryptedPreviewHydration(conv, messagesByUser)
  );
}
