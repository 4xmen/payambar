export type ChatMessage = {
  id?: number | null;
  client_message_id?: string;
  sender_id: number;
  receiver_id: number;
  content: string;
  status?: string;
  created_at: string;
  file_name?: string;
  file_url?: string;
  file_content_type?: string;
  encrypted?: boolean;
  e2ee_v?: number;
  alg?: string;
  sender_device_id?: string;
  key_id?: string;
  iv?: string;
  ciphertext?: string;
  aad?: unknown;
};

export type Conversation = {
  id: number;
  user_id: number;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
  is_online?: boolean;
  unread_count?: number;
  last_message_at?: string;
  last_message_preview?: string;
};

export type E2EEState = {
  enabled: boolean;
  ready: boolean;
  ownerUserId: number | null;
  deviceId: string;
  keyId: string;
  privateJwk: JsonWebKey | null;
  publicJwk: JsonWebKey | null;
  recipientKeys: Record<number, unknown[]>;
  recipientKeyPromises: Record<number, Promise<unknown[]>>;
  recipientKeyMeta: Record<number, { fetchedAt: number; ttl: number }>;
  noKeyWarnedRecipients: Record<number, boolean>;
};

export type ContextMenuState = {
  show: boolean;
  x: number;
  y: number;
  message: ChatMessage | null;
};

export type ConversationMenuState = {
  show: boolean;
  x: number;
  y: number;
  conversation: Conversation | null;
};

export type PullToRefreshState = {
  startY: number;
  currentY: number;
  pulling: boolean;
  refreshing: boolean;
  threshold: number;
  ready: boolean;
};

export type IncomingCallState = {
  sender_id: number;
  username: string;
  displayName?: string;
  avatar_url?: string | null;
  offer: RTCSessionDescriptionInit;
};

export type OutgoingCallState = {
  receiver_id: number;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  status: string;
};

export type ActiveCallState = {
  user_id: number;
  username: string;
  displayName?: string;
  avatar_url?: string | null;
};

export type SearchedUser = {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  isOnline: boolean;
  nameLabel: string;
};

export type ApiUserSearchRow = {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_online?: boolean;
};
