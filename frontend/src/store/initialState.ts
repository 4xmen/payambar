import type {
  ActiveCallState,
  ApiUserSearchRow,
  ContextMenuState,
  ConversationMenuState,
  E2EEState,
  IncomingCallState,
  OutgoingCallState,
  PullToRefreshState,
} from "@/store/types";

export type MessengerDataState = {
  token: string | null;
  userId: number | null;
  username: string | null;
  conversations: import("@/store/types").Conversation[];
  messages: Record<number, import("@/store/types").ChatMessage[]>;
  currentConversationId: number | null;
  currentConversationUsername: string;
  currentConversationDisplayName: string;
  currentConversationAvatarUrl: string | null;
  currentConversationIsOnline: boolean;
  messageText: string;
  searchQuery: string;
  ws: WebSocket | null;
  wsReconnectAttempts: number;
  wsMaxReconnectAttempts: number;
  wsReconnectBaseDelay: number;
  wsReconnectMaxDelay: number;
  wsReconnectTimer: ReturnType<typeof setTimeout> | null;
  wsIntentionalClose: boolean;
  wsConnected: boolean;
  authTab: "login" | "register";
  login: { username: string; password: string };
  register: { username: string; password: string; confirm: string };
  authPassword: string;
  suppressBackupWarningOnce: boolean;
  showRulesModal: boolean;
  acceptRules: boolean;
  authError: string;
  chatListOpen: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  loadingConversations: boolean;
  hasMoreMessages: Record<number, boolean>;
  uploadingFile: boolean;
  recordingVoice: boolean;
  recordingElapsedSec: number;
  recordingTimer: ReturnType<typeof setInterval> | null;
  recordingStream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  recordedChunks: Blob[];
  sendingVoice: boolean;
  showNewChatModal: boolean;
  newChatSearchQuery: string;
  newChatSearchResults: ApiUserSearchRow[];
  newChatSearchLoading: boolean;
  newChatSearchError: string;
  newChatSearchTimeout: ReturnType<typeof setTimeout> | null;
  showProfileModal: boolean;
  activeProfileTab: "profile" | "notifications" | "account" | "about";
  profileDisplayName: string;
  myAvatarUrl: string | null;
  uploadingAvatar: boolean;
  deleteAccountConfirm: string;
  deletingAccount: boolean;
  contextMenu: ContextMenuState;
  conversationMenu: ConversationMenuState;
  isOffline: boolean;
  serverOffline: boolean;
  pushNotificationsEnabled: boolean;
  pullToRefresh: PullToRefreshState;
  iceServers: RTCIceServer[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  incomingCall: IncomingCallState | null;
  outgoingCall: OutgoingCallState | null;
  activeCall: ActiveCallState | null;
  callDuration: string;
  callTimer: ReturnType<typeof setInterval> | null;
  callStartTime: number | null;
  audioEnabled: boolean;
  e2ee: E2EEState;
  appVersion: string;
};

const defaultE2ee: E2EEState = {
  enabled: true,
  ready: false,
  ownerUserId: null,
  deviceId: "",
  keyId: "",
  privateJwk: null,
  publicJwk: null,
  recipientKeys: {},
  recipientKeyPromises: {},
  recipientKeyMeta: {},
  noKeyWarnedRecipients: {},
};

export const initialState: MessengerDataState = {
  token: null,
  userId: null,
  username: null,
  conversations: [],
  messages: {},
  currentConversationId: null,
  currentConversationUsername: "",
  currentConversationDisplayName: "",
  currentConversationAvatarUrl: null,
  currentConversationIsOnline: false,
  messageText: "",
  searchQuery: "",
  ws: null,
  wsReconnectAttempts: 0,
  wsMaxReconnectAttempts: 50,
  wsReconnectBaseDelay: 1000,
  wsReconnectMaxDelay: 30000,
  wsReconnectTimer: null,
  wsIntentionalClose: false,
  wsConnected: false,
  authTab: "login",
  login: { username: "", password: "" },
  register: { username: "", password: "", confirm: "" },
  authPassword: "",
  suppressBackupWarningOnce: false,
  showRulesModal: false,
  acceptRules: false,
  authError: "",
  chatListOpen: true,
  loadingMessages: false,
  loadingOlderMessages: false,
  loadingConversations: false,
  hasMoreMessages: {},
  uploadingFile: false,
  recordingVoice: false,
  recordingElapsedSec: 0,
  recordingTimer: null,
  recordingStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  sendingVoice: false,
  showNewChatModal: false,
  newChatSearchQuery: "",
  newChatSearchResults: [],
  newChatSearchLoading: false,
  newChatSearchError: "",
  newChatSearchTimeout: null,
  showProfileModal: false,
  activeProfileTab: "profile",
  profileDisplayName: "",
  myAvatarUrl: null,
  uploadingAvatar: false,
  deleteAccountConfirm: "",
  deletingAccount: false,
  contextMenu: { show: false, x: 0, y: 0, message: null },
  conversationMenu: { show: false, x: 0, y: 0, conversation: null },
  isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  serverOffline: false,
  pushNotificationsEnabled: false,
  pullToRefresh: {
    startY: 0,
    currentY: 0,
    pulling: false,
    refreshing: false,
    threshold: 80,
    ready: false,
  },
  iceServers: [],
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  incomingCall: null,
  outgoingCall: null,
  activeCall: null,
  callDuration: "",
  callTimer: null,
  callStartTime: null,
  audioEnabled: true,
  e2ee: { ...defaultE2ee },
  appVersion: "",
};
