export interface User {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
  is_online?: boolean;
}

export interface SearchUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  isOnline: boolean;
  nameLabel: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
  is_online?: boolean;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count?: number;
  last_message?: Message | null;
}

export interface Message {
  id: number | null;
  client_message_id?: string;
  sender_id: number;
  receiver_id: number;
  content: string;
  status: 'sent' | 'delivered' | 'read' | string;
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
  aad?: string;
}

export interface DeviceKey {
  device_id: string;
  key_id: string;
  algorithm?: string;
  public_key: string;
  enc_private_key?: string;
  enc_private_key_iv?: string;
  kdf_salt?: string;
  kdf_iterations?: number;
  kdf_alg?: string;
  key_wrap_version?: number;
}

export interface E2EEEncryptedPayload {
  encrypted: true;
  e2ee_v: number;
  alg: string;
  sender_device_id: string;
  key_id: string;
  iv: string;
  ciphertext: string;
}

export interface E2EEState {
  enabled: boolean;
  ready: boolean;
  ownerUserId: number | null;
  deviceId: string;
  keyId: string;
  privateJwk: JsonWebKey | null;
  publicJwk: JsonWebKey | null;
  recipientKeys: Record<number, DeviceKey[]>;
  recipientKeyPromises: Record<number, Promise<DeviceKey[]>>;
  recipientKeyMeta: Record<number, { fetchedAt: number; ttl: number }>;
  noKeyWarnedRecipients: Record<number, boolean>;
}

export interface SessionData {
  token: string;
  userId: number;
  username: string;
  displayName: string;
}

export interface IncomingCall {
  sender_id: number;
  username: string;
  displayName?: string;
  avatar_url?: string | null;
  offer: RTCSessionDescriptionInit;
}

export interface OutgoingCall {
  receiver_id: number;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  status: 'calling' | 'ringing';
}

export interface ActiveCall {
  user_id: number;
  username: string;
  displayName?: string;
  avatar_url?: string | null;
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  message?: Message | null;
  conversation?: Conversation | null;
}

export interface PullToRefreshState {
  startY: number;
  currentY: number;
  pulling: boolean;
  refreshing: boolean;
  threshold: number;
  ready: boolean;
}
