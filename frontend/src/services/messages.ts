import type { Message } from '../types';
import { authHeaders } from './api';

export const DEFAULT_PAGE_SIZE = 50;

export interface FetchMessagesParams {
  userId: number;
  limit?: number;
  offset?: number;
  beforeId?: number;
}

export async function fetchMessages(
  apiUrl: string,
  token: string,
  { userId, limit = DEFAULT_PAGE_SIZE, offset, beforeId }: FetchMessagesParams,
  fetchFn?: typeof fetch
): Promise<Response> {
  const doFetch = fetchFn || fetch;
  let url = `${apiUrl}/messages?user_id=${userId}&limit=${limit}`;
  if (offset != null) url += `&offset=${offset}`;
  if (beforeId != null) url += `&before_id=${beforeId}`;
  return doFetch(url, { headers: authHeaders(token) });
}

export async function deleteMessage(
  apiUrl: string,
  token: string,
  messageId: number,
  fetchFn?: typeof fetch
): Promise<Response> {
  const doFetch = fetchFn || fetch;
  return doFetch(`${apiUrl}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export function conversationPeerId(
  senderId: number | string,
  receiverId: number | string,
  myUserId: number | string
): number {
  return Number(senderId) === Number(myUserId) ? Number(receiverId) : Number(senderId);
}

export function hasMoreMessages(page: Message[], pageSize = DEFAULT_PAGE_SIZE): boolean {
  return (page || []).length >= pageSize;
}

export function buildOptimisticTextMessage({
  userId,
  receiverId,
  content,
  clientMessageId,
  createdAt,
}: {
  userId: number;
  receiverId: number;
  content: string;
  clientMessageId: string;
  createdAt?: string;
}): Message {
  return {
    id: null,
    client_message_id: clientMessageId,
    sender_id: userId,
    receiver_id: receiverId,
    content,
    status: 'sent',
    created_at: createdAt || new Date().toISOString(),
  };
}

export function buildWsTextPayload({
  receiverId,
  content,
  clientMessageId,
  encryptedPayload,
}: {
  receiverId: number;
  content: string;
  clientMessageId: string;
  encryptedPayload?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: 'message',
    receiver_id: receiverId,
    content: encryptedPayload ? '' : content,
    client_message_id: clientMessageId,
  };
  if (encryptedPayload) {
    Object.assign(payload, encryptedPayload);
  }
  return payload;
}

export function buildMessageRecord(data: any, content: string): Message {
  return {
    id: data.message_id,
    sender_id: data.sender_id,
    receiver_id: data.receiver_id,
    content,
    status: data.status,
    created_at: data.created_at,
    client_message_id: data.client_message_id,
    file_name: data.file_name,
    file_url: data.file_url,
    file_content_type: data.file_content_type,
    encrypted: Boolean(data.encrypted),
    e2ee_v: data.e2ee_v,
    alg: data.alg,
    sender_device_id: data.sender_device_id,
    key_id: data.key_id,
    iv: data.iv,
    ciphertext: data.ciphertext,
    aad: data.aad,
  };
}

export function mergeFileFields(existing: Message, data: any): Message {
  return {
    ...existing,
    status: data.status,
    file_name: data.file_name || existing.file_name,
    file_url: data.file_url || existing.file_url,
    file_content_type: data.file_content_type || existing.file_content_type,
  };
}

export function applyIncomingMessage(
  messagesByUser: Record<number, Message[]>,
  myUserId: number | string,
  data: any,
  content: string
): { convUser: number; created: boolean } {
  const convUser = conversationPeerId(data.sender_id, data.receiver_id, myUserId);
  if (!messagesByUser[convUser]) {
    messagesByUser[convUser] = [];
  }

  const list = messagesByUser[convUser];
  const incomingID = Number(data.message_id);
  const existingByID = list.findIndex((m) => Number(m.id) === incomingID);
  let created = false;

  if (data.client_message_id) {
    const idx = list.findIndex((m) => m.client_message_id === data.client_message_id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        id: data.message_id,
        status: data.status,
        file_name: data.file_name || list[idx].file_name,
        file_url: data.file_url || list[idx].file_url,
        file_content_type: data.file_content_type || list[idx].file_content_type,
      };
    } else if (existingByID >= 0) {
      list[existingByID] = mergeFileFields(list[existingByID], data);
    } else {
      list.push(buildMessageRecord(data, content));
      created = true;
    }
  } else if (existingByID >= 0) {
    list[existingByID] = mergeFileFields(list[existingByID], data);
  } else {
    list.push(buildMessageRecord(data, content));
    created = true;
  }

  return { convUser, created };
}

export function unreadIncomingIds(messages: Message[], myUserId: number | string): number[] {
  return (messages || [])
    .filter(
      (msg) =>
        Number(msg.sender_id) !== Number(myUserId) &&
        msg.status !== 'read' &&
        msg.id != null
    )
    .map((msg) => msg.id as number);
}

export function removeMessageById(
  messagesByUser: Record<number, Message[]>,
  convUserId: number,
  messageId: number
): boolean {
  const convMessages = messagesByUser[convUserId];
  if (!convMessages) return false;
  const idx = convMessages.findIndex((m) => Number(m.id) === Number(messageId));
  if (idx === -1) return false;
  convMessages.splice(idx, 1);
  return true;
}

export function upsertOfflineFileMessage(
  messagesByUser: Record<number, Message[]>,
  receiverId: number,
  msg: Message
): Message {
  if (!messagesByUser[receiverId]) {
    messagesByUser[receiverId] = [];
  }
  const list = messagesByUser[receiverId];
  const existingIdx = list.findIndex((m) => Number(m.id) === Number(msg.id));
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...msg };
    return list[existingIdx];
  }
  list.push(msg);
  return msg;
}

export function buildOfflineFileMessage({
  messageId,
  userId,
  receiverId,
  fileName,
  fileUrl,
  fileContentType,
  createdAt,
}: {
  messageId: number;
  userId: number;
  receiverId: number;
  fileName: string;
  fileUrl: string;
  fileContentType?: string;
  createdAt?: string;
}): Message {
  return {
    id: messageId,
    sender_id: userId,
    receiver_id: receiverId,
    content: `📎 ${fileName}`,
    file_name: fileName,
    file_url: fileUrl,
    file_content_type: fileContentType || '',
    status: 'sent',
    created_at: createdAt || new Date().toISOString(),
  };
}
