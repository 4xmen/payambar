import type { ChangeEvent, MouseEvent, TouchEvent, UIEvent } from "react";
import { toast } from "sonner";
import { getConversationPreview, getSortedConversations } from "@/lib/format";
import { API_URL, NEW_CHAT_SEARCH_DEBOUNCE_MS, WS_URL } from "@/store/constants";
import { domRefs } from "@/store/domRefs";
import type { ChatMessage } from "@/store/types";
import type { MessengerDataState } from "@/store/initialState";

type G = () => MessengerDataState & Record<string, unknown>;
type S = (fn: (d: MessengerDataState) => void) => void;

export function runtimePart(set: S, get: G) {
  const api: Record<string, unknown> = {};

  api.openRulesModal = () => set((d) => { d.showRulesModal = true; });
  api.closeRulesModal = () => set((d) => { d.showRulesModal = false; });

  api.fetchWebRTCConfig = async () => {
    try {
      const s = get();
      const res = await fetch(`${API_URL}/webrtc/config`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        set((d) => {
          d.iceServers = data.iceServers || [];
        });
      }
    } catch {
      set((d) => {
        d.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
      });
    }
  };

  api.loadMyProfile = async () => {
    try {
      const s = get();
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        set((d) => {
          d.profileDisplayName = data.display_name || "";
          d.myAvatarUrl = data.avatar_url || null;
        });
      }
    } catch {
      /* noop */
    }
  };

  api.saveProfile = async () => {
    try {
      const s = get();
      const res = await fetch(`${API_URL}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ display_name: s.profileDisplayName }),
      });
      if (!res.ok) throw new Error("fail");
      set((d) => {
        d.showProfileModal = false;
      });
      toast.success("پروفایل ذخیره شد");
    } catch {
      alert("خطا در ذخیره پروفایل");
    }
  };

  api.restorePushSubscription = async () => {
    const stored = localStorage.getItem("pushNotificationsEnabled");
    if (stored === "true") {
      set((d) => {
        d.pushNotificationsEnabled = true;
      });
      try {
        await (api.subscribePush as () => Promise<void>)();
      } catch {
        /* noop */
      }
    }
  };

  api.togglePushNotifications = async () => {
    const on = get().pushNotificationsEnabled;
    if (on) {
      try {
        await (api.subscribePush as () => Promise<void>)();
        localStorage.setItem("pushNotificationsEnabled", "true");
      } catch {
        set((d) => {
          d.pushNotificationsEnabled = false;
        });
        localStorage.removeItem("pushNotificationsEnabled");
        alert("فعال‌سازی اعلان‌ها ناموفق بود");
      }
    } else {
      try {
        await (api.unsubscribePush as () => Promise<void>)();
      } catch {
        /* noop */
      }
      localStorage.removeItem("pushNotificationsEnabled");
    }
  };

  api.subscribePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("no push");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("denied");
    const vapidRes = await fetch(`${API_URL}/push/vapid-key`);
    if (!vapidRes.ok) throw new Error("no vapid");
    const { vapid_public_key } = await vapidRes.json();
    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    };
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
    });
    const subJSON = subscription.toJSON();
    const s = get();
    const res = await fetch(`${API_URL}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({
        endpoint: subJSON.endpoint,
        keys: { p256dh: subJSON.keys?.p256dh, auth: subJSON.keys?.auth },
      }),
    });
    if (!res.ok) throw new Error("rejected");
  };

  api.unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const subJSON = subscription.toJSON();
        const s = get();
        await fetch(`${API_URL}/push/subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
          body: JSON.stringify({ endpoint: subJSON.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } catch {
      /* noop */
    }
  };

  api.deleteAccount = async () => {
    const s = get();
    if (!s.username || s.deleteAccountConfirm.trim() !== s.username) {
      alert("نام کاربری وارد شده صحیح نیست");
      return;
    }
    if (!confirm("این عملیات غیرقابل بازگشت است. آیا از حذف حساب اطمینان دارید؟")) return;
    set((d) => {
      d.deletingAccount = true;
    });
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "fail");
      }
      (get().clearAuth as () => void)();
      alert("حساب کاربری حذف شد");
    } catch {
      alert("خطا در حذف حساب");
    } finally {
      set((d) => {
        d.deletingAccount = false;
      });
    }
  };

  api.handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("لطفا یک فایل تصویری انتخاب کنید");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("حجم آواتار باید کمتر از ۲ مگابایت باشد");
      return;
    }
    set((d) => {
      d.uploadingAvatar = true;
    });
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const s = get();
      const res = await fetch(`${API_URL}/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      set((d) => {
        d.myAvatarUrl = data.avatar_url;
      });
    } catch {
      alert("خطا در آپلود آواتار");
    } finally {
      set((d) => {
        d.uploadingAvatar = false;
      });
      event.target.value = "";
    }
  };

  api.sortConversationsInPlace = () => {
    const s = get();
    const sorted = getSortedConversations(s.conversations, s.messages);
    set((d) => {
      d.conversations = sorted;
    });
  };

  api.updateConversationLastMessage = (userId: number, timestamp: string) => {
    if (!userId || !timestamp) return;
    const idx = get().conversations.findIndex((c) => c.user_id === userId);
    if (idx === -1) return;
    set((d) => {
      d.conversations[idx].last_message_at = timestamp;
    });
    (api.sortConversationsInPlace as () => void)();
  };

  api.loadConversations = async () => {
    set((d) => {
      d.loadingConversations = true;
    });
    try {
      const s = get();
      const res = await fetch(`${API_URL}/conversations`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        if (res.status === 401) (get().clearAuth as () => void)();
        return;
      }
      set((d) => {
        d.serverOffline = false;
      });
      const data = await res.json();
      set((d) => {
        d.conversations = data.conversations || [];
      });
      (api.sortConversationsInPlace as () => void)();
      (api.hydrateEncryptedConversationPreviews as () => void)();
    } catch {
      set((d) => {
        d.serverOffline = true;
      });
    } finally {
      set((d) => {
        d.loadingConversations = false;
      });
    }
  };

  api.syncAfterResume = async () => {
    await (api.loadConversations as () => Promise<void>)();
    if (get().currentConversationId) {
      await (api.refreshCurrentConversation as (o?: { keepScroll?: boolean }) => Promise<void>)({
        keepScroll: true,
      });
    }
  };

  api.hydrateEncryptedConversationPreviews = () => {
    const s = get();
    for (const conv of s.conversations) {
      const preview = (conv.last_message_preview || "").trim();
      const hasLocalPreview = getConversationPreview(conv, s.messages);
      if (hasLocalPreview || preview !== "پیام رمزنگاری شده") continue;
      void (api.refreshConversationPreview as (uid: number) => Promise<void>)(conv.user_id).catch(() => {});
    }
  };

  api.refreshConversationPreview = async (userId: number) => {
    const s = get();
    if (!userId || (s.messages[userId]?.length ?? 0) > 0) return;
    const res = await fetch(`${API_URL}/messages?user_id=${userId}&limit=1`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const latestMessages = await (get().decryptMessageList as (m: ChatMessage[]) => Promise<ChatMessage[]>)(
      data.messages || []
    );
    if (latestMessages.length) {
      set((d) => {
        d.messages[userId] = latestMessages;
      });
    }
  };

  api.selectConversation = async (conv: import("@/store/types").Conversation) => {
    (api.closeConversationMenu as () => void)();
    set((d) => {
      d.currentConversationId = conv.user_id;
      d.currentConversationUsername = conv.username;
      d.currentConversationDisplayName = conv.display_name || "";
      d.currentConversationAvatarUrl = conv.avatar_url || null;
      d.currentConversationIsOnline = conv.is_online || false;
      d.loadingMessages = true;
      d.chatListOpen = false;
    });
    const idx = get().conversations.findIndex((c) => c.user_id === conv.user_id);
    if (idx !== -1) {
      set((d) => {
        d.conversations[idx].unread_count = 0;
      });
    }
    try {
      const s = get();
      const res = await fetch(`${API_URL}/messages?user_id=${conv.user_id}&limit=50`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          (get().clearAuth as () => void)();
          return;
        }
        if (res.status === 404) {
          (api.closeConversation as () => void)();
          await (api.loadConversations as () => Promise<void>)();
          return;
        }
        throw new Error("fail");
      }
      const data = await res.json();
      const decrypted = await (get().decryptMessageList as (m: ChatMessage[]) => Promise<ChatMessage[]>)(
        data.messages || []
      );
      set((d) => {
        d.messages[conv.user_id] = decrypted;
        d.hasMoreMessages[conv.user_id] = (data.messages || []).length >= 50;
      });
      const list = get().messages[conv.user_id] || [];
      const latestMessage = list.length ? list[list.length - 1] : null;
      if (latestMessage?.created_at) {
        (api.updateConversationLastMessage as (a: number, b: string) => void)(
          conv.user_id,
          latestMessage.created_at
        );
      }
      const ws = get().ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        for (const msg of list) {
          if (Number(msg.sender_id) !== Number(s.userId) && msg.status !== "read") {
            ws.send(JSON.stringify({ type: "mark_read", message_id: msg.id }));
          }
        }
      }
      setTimeout(() => (api.scrollToBottom as () => void)(), 100);
    } catch {
      set((d) => {
        d.messages[conv.user_id] = [];
      });
    } finally {
      set((d) => {
        d.loadingMessages = false;
      });
    }
  };

  api.sendMessage = async () => {
    const s = get();
    const content = (s.messageText || "").trim();
    if (!content || !s.currentConversationId || !s.ws || s.ws.readyState !== WebSocket.OPEN) return;
    const receiverId = Number(s.currentConversationId);
    const clientMessageId = `client-${Date.now()}`;
    const msg: ChatMessage = {
      id: null,
      client_message_id: clientMessageId,
      sender_id: s.userId!,
      receiver_id: receiverId,
      content,
      status: "sent",
      created_at: new Date().toISOString(),
    };
    set((d) => {
      if (!d.messages[receiverId]) d.messages[receiverId] = [];
      d.messages[receiverId].push(msg);
      d.messageText = "";
      d.chatListOpen = false;
    });
    (api.updateConversationLastMessage as (a: number, b: string) => void)(receiverId, msg.created_at);
    queueMicrotask(() => {
      (api.resizeMessageInput as () => void)();
      (api.focusMessageInput as () => void)();
    });
    let encryptedPayload: Record<string, unknown> | null = null;
    try {
      encryptedPayload = (await (get().encryptTextMessage as (a: number, b: string) => Promise<Record<string, unknown> | null>)(
        receiverId,
        content
      )) as Record<string, unknown> | null;
    } catch {
      /* noop */
    }
    const st = get();
    if (st.e2ee.enabled && !encryptedPayload && !st.e2ee.noKeyWarnedRecipients[receiverId]) {
      alert("ارسال امن ممکن نیست؛ کلید مخاطب در دسترس نیست. پیام به صورت غیر رمزنگاری‌شده ارسال می‌شود.");
      set((d) => {
        d.e2ee.noKeyWarnedRecipients[receiverId] = true;
      });
    }
    const payload: Record<string, unknown> = {
      type: "message",
      receiver_id: receiverId,
      content: encryptedPayload ? "" : content,
      client_message_id: clientMessageId,
    };
    if (encryptedPayload) Object.assign(payload, encryptedPayload);
    get().ws!.send(JSON.stringify(payload));
    queueMicrotask(() => {
      (api.scrollToBottom as () => void)();
      (api.focusMessageInput as () => void)();
    });
  };

  api.resizeMessageInput = () => {
    const input = domRefs.messageInput;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };

  api.focusMessageInput = () => {
    const input = domRefs.messageInput;
    input?.focus({ preventScroll: true });
  };

  api.sendFileMessage = async (file: File) => {
    const s = get();
    if (!file || !s.currentConversationId) return;
    const receiverId = Number(s.currentConversationId);
    set((d) => {
      d.uploadingFile = true;
    });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("receiver_id", String(receiverId));
    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      const messageID = Number(data.message_id);
      const wsOpen = s.ws && s.ws.readyState === WebSocket.OPEN;
      if (!wsOpen) {
        set((d) => {
          if (!d.messages[receiverId]) d.messages[receiverId] = [];
          const existingIdx = d.messages[receiverId].findIndex((m) => Number(m.id) === messageID);
          const createdAt = new Date().toISOString();
          const msg: ChatMessage = {
            id: messageID,
            sender_id: s.userId!,
            receiver_id: receiverId,
            content: `📎 ${data.file_name}`,
            file_name: data.file_name,
            file_url: data.file_url,
            file_content_type: data.file_content_type || file.type || "",
            status: "sent",
            created_at: createdAt,
          };
          if (existingIdx >= 0) {
            d.messages[receiverId][existingIdx] = { ...d.messages[receiverId][existingIdx], ...msg };
          } else {
            d.messages[receiverId].push(msg);
          }
        });
        (api.updateConversationLastMessage as (a: number, b: string) => void)(
          receiverId,
          new Date().toISOString()
        );
        if (Number(get().currentConversationId) === receiverId) {
          queueMicrotask(() => (api.scrollToBottom as () => void)());
        }
      }
      await (api.loadConversations as () => Promise<void>)();
    } catch {
      alert("خطا در آپلود فایل");
    } finally {
      set((d) => {
        d.uploadingFile = false;
      });
    }
  };

  api.handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !get().currentConversationId) return;
    await (api.sendFileMessage as (f: File) => Promise<void>)(file);
    event.target.value = "";
  };

  api.cleanupVoiceRecorder = () => {
    const s = get();
    if (s.recordingTimer) {
      clearInterval(s.recordingTimer);
      set((d) => {
        d.recordingTimer = null;
      });
    }
    if (s.mediaRecorder) {
      s.mediaRecorder.ondataavailable = null;
      s.mediaRecorder.onstop = null;
      set((d) => {
        d.mediaRecorder = null;
      });
    }
    if (s.recordingStream) {
      s.recordingStream.getTracks().forEach((t) => t.stop());
      set((d) => {
        d.recordingStream = null;
      });
    }
    set((d) => {
      d.recordedChunks = [];
      d.recordingVoice = false;
      d.recordingElapsedSec = 0;
    });
  };

  api.toggleVoiceRecording = async () => {
    const s = get();
    if (!s.currentConversationId || s.uploadingFile || s.sendingVoice) return;
    if (s.recordingVoice) {
      (api.stopVoiceRecordingAndSend as () => void)();
      return;
    }
    await (api.startVoiceRecording as () => Promise<void>)();
  };

  api.startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      set((d) => {
        d.recordedChunks = [];
        d.recordingStream = stream;
        d.mediaRecorder = recorder;
        d.recordingVoice = true;
        d.recordingElapsedSec = 0;
      });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          set((d) => {
            d.recordedChunks.push(event.data);
          });
        }
      };
      recorder.onstop = async () => {
        const rec = get().mediaRecorder;
        const chunks = get().recordedChunks;
        const mimeType = rec?.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        (api.cleanupVoiceRecorder as () => void)();
        if (blob.size === 0) return;
        set((d) => {
          d.sendingVoice = true;
        });
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4") || mimeType.includes("m4a")
            ? "m4a"
            : "webm";
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        await (api.sendFileMessage as (f: File) => Promise<void>)(file);
        set((d) => {
          d.sendingVoice = false;
        });
      };
      recorder.start(250);
      const timer = setInterval(() => {
        set((d) => {
          d.recordingElapsedSec += 1;
        });
      }, 1000);
      set((d) => {
        d.recordingTimer = timer;
      });
    } catch {
      alert("دسترسی میکروفون لازم است");
      (api.cleanupVoiceRecorder as () => void)();
    }
  };

  api.stopVoiceRecordingAndSend = () => {
    const s = get();
    if (!s.mediaRecorder || s.mediaRecorder.state === "inactive") return;
    if (s.recordingTimer) {
      clearInterval(s.recordingTimer);
      set((d) => {
        d.recordingTimer = null;
      });
    }
    set((d) => {
      d.recordingVoice = false;
    });
    s.mediaRecorder.stop();
  };

  api.scrollToBottom = (attempts = 0) => {
    const container = domRefs.messagesContainer;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        (api.updatePullReady as (el?: HTMLElement | null) => void)(container);
        if (attempts < 3 && container.scrollTop < container.scrollHeight - container.clientHeight - 50) {
          setTimeout(() => (api.scrollToBottom as (a?: number) => void)(attempts + 1), 100);
        }
      });
    }
  };

  api.handleMessagesScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    (api.updatePullReady as (el?: HTMLElement | null) => void)(container);
    if (
      container.scrollTop < 100 &&
      !get().loadingOlderMessages &&
      get().hasMoreMessages[get().currentConversationId!]
    ) {
      void (api.loadOlderMessages as () => Promise<void>)();
    }
  };

  api.loadOlderMessages = async () => {
    const s = get();
    if (!s.currentConversationId || s.loadingOlderMessages) return;
    const conversationId = Number(s.currentConversationId);
    const currentMessages = s.messages[conversationId] || [];
    if (currentMessages.length === 0) return;
    set((d) => {
      d.loadingOlderMessages = true;
    });
    const container = domRefs.messagesContainer;
    const oldScrollHeight = container ? container.scrollHeight : 0;
    try {
      const offset = currentMessages.length;
      const res = await fetch(
        `${API_URL}/messages?user_id=${conversationId}&limit=50&offset=${offset}`,
        { headers: { Authorization: `Bearer ${s.token}` } }
      );
      if (!res.ok) {
        if (res.status === 404) {
          (api.closeConversation as () => void)();
          await (api.loadConversations as () => Promise<void>)();
        }
        return;
      }
      const data = await res.json();
      const olderMessages = await (get().decryptMessageList as (m: ChatMessage[]) => Promise<ChatMessage[]>)(
        data.messages || []
      );
      if (olderMessages.length > 0) {
        set((d) => {
          d.messages[conversationId] = [...olderMessages, ...(d.messages[conversationId] || [])];
        });
        queueMicrotask(() => {
          const c = domRefs.messagesContainer;
          if (c) {
            const newScrollHeight = c.scrollHeight;
            c.scrollTop = newScrollHeight - oldScrollHeight;
          }
        });
      }
      set((d) => {
        d.hasMoreMessages[conversationId] = olderMessages.length >= 50;
      });
    } catch {
      /* noop */
    } finally {
      set((d) => {
        d.loadingOlderMessages = false;
      });
    }
  };

  api.getPullBottomAllowance = (el: HTMLElement | null) => {
    if (!el) return 12;
    const style = window.getComputedStyle(el);
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    return paddingBottom + 24;
  };

  api.isNearBottom = (el: HTMLElement | null) => {
    if (!el) return false;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const allowance = (api.getPullBottomAllowance as (el: HTMLElement | null) => number)(el);
    return distanceFromBottom <= allowance + 160;
  };

  api.updatePullReady = (container?: HTMLElement | null) => {
    const el = container ?? domRefs.messagesContainer;
    if (!el) return;
    set((d) => {
      d.pullToRefresh.ready = (api.isNearBottom as (el: HTMLElement | null) => boolean)(el);
    });
  };

  api.handlePullStart = (event: TouchEvent | MouseEvent) => {
    if (!get().currentConversationId || get().pullToRefresh.refreshing) return;
    const container = domRefs.messagesContainer;
    if (!container) return;
    if (!(api.isNearBottom as (el: HTMLElement | null) => boolean)(container)) return;
    set((d) => {
      d.pullToRefresh.ready = true;
    });
    const touch = "touches" in event && event.touches ? event.touches[0] : (event as MouseEvent);
    set((d) => {
      d.pullToRefresh.startY = touch.clientY;
      d.pullToRefresh.pulling = true;
    });
  };

  api.handlePullMove = (event: TouchEvent) => {
    if (!get().pullToRefresh.pulling || get().pullToRefresh.refreshing) return;
    const touch = event.touches[0];
    const deltaY = touch.clientY - get().pullToRefresh.startY;
    if (deltaY < 0) {
      const magnitude = Math.abs(deltaY);
      set((d) => {
        d.pullToRefresh.currentY = Math.min(magnitude, d.pullToRefresh.threshold * 1.5);
      });
      if (magnitude > 10) event.preventDefault();
    } else {
      set((d) => {
        d.pullToRefresh.currentY = 0;
      });
    }
  };

  api.handlePullEnd = async () => {
    if (!get().pullToRefresh.pulling) return;
    const cur = get().pullToRefresh;
    if (cur.currentY >= cur.threshold) {
      set((d) => {
        d.pullToRefresh.refreshing = true;
      });
      await (api.refreshCurrentConversation as () => Promise<void>)();
      set((d) => {
        d.pullToRefresh.refreshing = false;
      });
    }
    set((d) => {
      d.pullToRefresh.pulling = false;
      d.pullToRefresh.startY = 0;
      d.pullToRefresh.currentY = 0;
    });
    (api.updatePullReady as () => void)();
  };

  api.refreshCurrentConversation = async (options: { keepScroll?: boolean } = {}) => {
    const cid = get().currentConversationId;
    if (!cid) return;
    const conversationId = Number(cid);
    const container = domRefs.messagesContainer;
    const wasNearBottom = (api.isNearBottom as (el: HTMLElement | null) => boolean)(container);
    try {
      const s = get();
      const res = await fetch(`${API_URL}/messages?user_id=${conversationId}&limit=50`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          (api.closeConversation as () => void)();
          await (api.loadConversations as () => Promise<void>)();
        }
        return;
      }
      const data = await res.json();
      const msgs = await (get().decryptMessageList as (m: ChatMessage[]) => Promise<ChatMessage[]>)(
        data.messages || []
      );
      set((d) => {
        d.messages[conversationId] = msgs;
        d.hasMoreMessages[conversationId] = (data.messages || []).length >= 50;
      });
      const list = get().messages[conversationId] || [];
      const latestMessage = list.length ? list[list.length - 1] : null;
      if (latestMessage?.created_at) {
        (api.updateConversationLastMessage as (a: number, b: string) => void)(
          conversationId,
          latestMessage.created_at
        );
      }
      if (!options.keepScroll || wasNearBottom) {
        queueMicrotask(() => (api.scrollToBottom as () => void)());
      }
      (api.updatePullReady as () => void)();
      await (api.loadConversations as () => Promise<void>)();
    } catch {
      /* noop */
    }
  };

  api.goBackToList = () => {
    (api.closeConversation as () => void)();
  };

  api.closeConversation = () => {
    set((d) => {
      d.currentConversationId = null;
      d.currentConversationUsername = "";
      d.currentConversationDisplayName = "";
      d.currentConversationAvatarUrl = null;
      d.currentConversationIsOnline = false;
      d.chatListOpen = true;
    });
  };

  api.closeWebSocket = (intentional = true) => {
    set((d) => {
      d.wsIntentionalClose = intentional;
      d.wsConnected = false;
    });
    const timer = get().wsReconnectTimer;
    if (timer) {
      clearTimeout(timer);
      set((d) => {
        d.wsReconnectTimer = null;
      });
    }
    const ws = get().ws;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
      set((d) => {
        d.ws = null;
      });
    }
    if (intentional) {
      set((d) => {
        d.wsReconnectAttempts = 0;
        d.serverOffline = false;
      });
    }
  };

  api.connectWebSocket = () => {
    const token = get().token;
    const isTokenValid = typeof token === "string" && token && token !== "undefined" && token !== "null";
    const authed = !!(get().token && get().userId && get().userId! > 0);
    if (!authed || !isTokenValid) return;
    const existing = get().ws;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const rt = get().wsReconnectTimer;
    if (rt) {
      clearTimeout(rt);
      set((d) => {
        d.wsReconnectTimer = null;
      });
    }
    set((d) => {
      d.wsIntentionalClose = false;
      d.wsConnected = false;
    });
    const wsUrlWithToken = `${WS_URL}?token=${encodeURIComponent(token!)}`;
    const ws = new WebSocket(wsUrlWithToken);
    set((d) => {
      d.ws = ws;
    });
    ws.onopen = () => {
      set((d) => {
        d.wsReconnectAttempts = 0;
        d.serverOffline = false;
        d.wsConnected = true;
      });
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        void (api.handleWebSocketMessage as (x: Record<string, unknown>) => Promise<void>)(data);
      } catch {
        /* noop */
      }
    };
    ws.onerror = () => {
      if (!get().token || get().wsIntentionalClose) return;
      set((d) => {
        d.serverOffline = true;
        d.wsConnected = false;
      });
    };
    ws.onclose = () => {
      const intentional = get().wsIntentionalClose || !(get().token && get().userId);
      set((d) => {
        d.ws = null;
        d.wsConnected = false;
      });
      if (intentional) {
        set((d) => {
          d.wsIntentionalClose = false;
        });
        return;
      }
      set((d) => {
        d.serverOffline = true;
      });
      const s = get();
      const authed2 = !!(s.token && s.userId && s.userId > 0);
      if (s.wsReconnectAttempts < s.wsMaxReconnectAttempts && authed2) {
        set((d) => {
          d.wsReconnectAttempts += 1;
        });
        const delay = Math.min(
          s.wsReconnectBaseDelay * Math.pow(2, get().wsReconnectAttempts - 1),
          s.wsReconnectMaxDelay
        );
        const t = setTimeout(() => {
          set((d) => {
            d.wsReconnectTimer = null;
          });
          (api.connectWebSocket as () => void)();
        }, delay);
        set((d) => {
          d.wsReconnectTimer = t;
        });
      }
    };
  };

  api.handleWebSocketMessage = async (data: Record<string, unknown>) => {
    if (data.type === "call_offer") {
      const s = get();
      if (s.activeCall || s.incomingCall || s.outgoingCall) {
        s.ws?.send(
          JSON.stringify({ type: "call_reject", receiver_id: data.sender_id, payload: { reason: "busy" } })
        );
        return;
      }
      const sender =
        s.conversations.find((c) => c.user_id === data.sender_id) ||
        ({ username: "کاربر", user_id: data.sender_id } as import("@/store/types").Conversation);
      const payload = data.payload as { offer?: RTCSessionDescriptionInit };
      set((d) => {
        d.incomingCall = {
          sender_id: data.sender_id as number,
          username: sender.username,
          displayName: sender.display_name,
          avatar_url: sender.avatar_url,
          offer: payload.offer!,
        };
      });
    } else if (data.type === "call_answer") {
      const s = get();
      const oc = s.outgoingCall;
      const payload = data.payload as { answer?: RTCSessionDescriptionInit };
      if (oc && oc.receiver_id === data.sender_id && s.peerConnection && payload.answer) {
        await s.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
        set((d) => {
          d.activeCall = {
            user_id: oc.receiver_id,
            username: oc.username,
            displayName: oc.displayName,
            avatar_url: oc.avatarUrl ?? null,
          };
          d.outgoingCall = null;
        });
        (api.startCallTimer as () => void)();
      }
    } else if (data.type === "ice_candidate") {
      const pc = get().peerConnection;
      const payload = data.payload as { candidate?: RTCIceCandidateInit };
      if (pc && payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } else if (data.type === "call_reject") {
      const oc = get().outgoingCall;
      if (oc && oc.receiver_id === data.sender_id) {
        alert("تماس رد شد");
        (api.endCall as (b?: boolean) => void)(false);
      }
    } else if (data.type === "call_hangup") {
      const ac = get().activeCall;
      const ic = get().incomingCall;
      if ((ac && ac.user_id === data.sender_id) || (ic && ic.sender_id === data.sender_id)) {
        (api.endCall as (b?: boolean) => void)(false);
      }
    } else if (data.type === "message") {
      const normalizedMessage = await (get().maybeDecryptMessage as (m: ChatMessage) => Promise<ChatMessage>)(
        data as unknown as ChatMessage
      );
      const incomingContent = normalizedMessage.content;
      const senderId = Number(data.sender_id);
      const receiverId = Number(data.receiver_id);
      const s = get();
      const convUser = senderId === Number(s.userId) ? receiverId : senderId;
      set((d) => {
        if (!d.messages[convUser]) d.messages[convUser] = [];
      });
      const incomingID = Number(data.message_id);
      const list = get().messages[convUser] || [];
      const existingByID = list.findIndex((m) => Number(m.id) === incomingID);
      const pushMsg = (): ChatMessage => ({
        id: data.message_id as number,
        sender_id: data.sender_id as number,
        receiver_id: data.receiver_id as number,
        content: incomingContent,
        status: data.status as string,
        created_at: data.created_at as string,
        client_message_id: data.client_message_id as string | undefined,
        file_name: data.file_name as string | undefined,
        file_url: data.file_url as string | undefined,
        file_content_type: data.file_content_type as string | undefined,
        encrypted: !!data.encrypted,
        e2ee_v: data.e2ee_v as number | undefined,
        alg: data.alg as string | undefined,
        sender_device_id: data.sender_device_id as string | undefined,
        key_id: data.key_id as string | undefined,
        iv: data.iv as string | undefined,
        ciphertext: data.ciphertext as string | undefined,
      });
      if (data.client_message_id) {
        const idx = list.findIndex((m) => m.client_message_id === data.client_message_id);
        if (idx >= 0) {
          set((draft) => {
            const row = draft.messages[convUser][idx];
            draft.messages[convUser][idx] = {
              ...row,
              id: data.message_id as number,
              status: data.status as string,
              file_name: (data.file_name as string) || row.file_name,
              file_url: (data.file_url as string) || row.file_url,
              file_content_type: (data.file_content_type as string) || row.file_content_type,
            };
          });
        } else if (existingByID >= 0) {
          set((draft) => {
            const row = draft.messages[convUser][existingByID];
            draft.messages[convUser][existingByID] = {
              ...row,
              status: data.status as string,
              file_name: (data.file_name as string) || row.file_name,
              file_url: (data.file_url as string) || row.file_url,
              file_content_type: (data.file_content_type as string) || row.file_content_type,
            };
          });
        } else {
          set((draft) => {
            draft.messages[convUser].push(pushMsg());
          });
        }
      } else if (existingByID >= 0) {
        set((draft) => {
          const row = draft.messages[convUser][existingByID];
          draft.messages[convUser][existingByID] = {
            ...row,
            status: data.status as string,
            file_name: (data.file_name as string) || row.file_name,
            file_url: (data.file_url as string) || row.file_url,
            file_content_type: (data.file_content_type as string) || row.file_content_type,
          };
        });
      } else {
        set((draft) => {
          draft.messages[convUser].push(pushMsg());
        });
      }
      const ci = get().conversations.findIndex((c) => c.user_id === convUser);
      if (ci !== -1) {
        set((draft) => {
          draft.conversations[ci].last_message_at =
            (data.created_at as string) || new Date().toISOString();
        });
      }
      const curId = Number(get().currentConversationId);
      if (curId === convUser) {
        get().ws?.send(JSON.stringify({ type: "mark_delivered", message_id: data.message_id }));
        get().ws?.send(JSON.stringify({ type: "mark_read", message_id: data.message_id }));
        queueMicrotask(() => (api.scrollToBottom as () => void)());
      } else if (senderId !== Number(get().userId)) {
        if (ci !== -1) {
          set((draft) => {
            const u = draft.conversations[ci].unread_count || 0;
            draft.conversations[ci].unread_count = u + 1;
          });
        }
      }
      await (api.loadConversations as () => Promise<void>)();
    } else if (data.type === "status_update") {
      const mid = data.message_id as number;
      const st = data.status as string;
      set((draft) => {
        for (const uid of Object.keys(draft.messages)) {
          const arr = draft.messages[Number(uid)];
          const found = arr?.find((m) => m.id === mid);
          if (found) {
            found.status = st;
            break;
          }
        }
      });
    }
  };

  api.openNewChat = () => {
    set((d) => {
      d.showNewChatModal = true;
      d.newChatSearchQuery = "";
      d.newChatSearchResults = [];
      d.newChatSearchError = "";
      d.newChatSearchLoading = false;
    });
    setTimeout(() => domRefs.newChatSearchInput?.focus(), 0);
  };

  api.closeNewChatModal = () => {
    const to = get().newChatSearchTimeout;
    if (to) clearTimeout(to);
    set((d) => {
      d.showNewChatModal = false;
      d.newChatSearchQuery = "";
      d.newChatSearchResults = [];
      d.newChatSearchError = "";
      d.newChatSearchLoading = false;
      d.newChatSearchTimeout = null;
    });
  };

  api.onNewChatSearchInput = () => {
    const q = get().newChatSearchQuery.trim();
    set((d) => {
      d.newChatSearchError = "";
    });
    const existing = get().newChatSearchTimeout;
    if (existing) clearTimeout(existing);
    if (!q || q.length < 3) {
      set((d) => {
        d.newChatSearchLoading = false;
        d.newChatSearchResults = [];
        d.newChatSearchTimeout = null;
      });
      return;
    }
    set((d) => {
      d.newChatSearchLoading = true;
    });
    const t = setTimeout(() => {
      void (api.searchUsersForNewChat as (query: string) => Promise<void>)(q);
    }, NEW_CHAT_SEARCH_DEBOUNCE_MS);
    set((d) => {
      d.newChatSearchTimeout = t;
    });
  };

  api.searchUsersForNewChat = async (query: string) => {
    try {
      const s = get();
      const res = await fetch(`${API_URL}/users?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) throw new Error("fail");
      const users = await res.json();
      set((d) => {
        d.newChatSearchResults = Array.isArray(users) ? users : [];
      });
    } catch {
      set((d) => {
        d.newChatSearchResults = [];
        d.newChatSearchError = "خطا در جستجو";
      });
    } finally {
      set((d) => {
        d.newChatSearchLoading = false;
        d.newChatSearchTimeout = null;
      });
    }
  };

  api.handleSelectSearchedUser = async (user: {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
    is_online?: boolean;
  }) => {
    await (api.startConversation as (
      a: number,
      b: string,
      c?: string,
      d?: string,
      e?: boolean
    ) => Promise<void>)(
      user.id,
      user.username,
      user.display_name,
      user.avatar_url,
      user.is_online
    );
    (api.closeNewChatModal as () => void)();
  };

  api.startConversation = async (
    userId: number,
    username: string,
    displayName = "",
    avatarUrl = "",
    isOnline = false
  ) => {
    const existing = get().conversations.find((c) => c.user_id === userId);
    if (existing) {
      set((d) => {
        const ix = d.conversations.findIndex((c) => c.user_id === userId);
        if (ix !== -1) d.conversations[ix].is_online = isOnline;
      });
      await (api.selectConversation as (c: import("@/store/types").Conversation) => Promise<void>)(
        get().conversations.find((c) => c.user_id === userId)!
      );
      return;
    }
    try {
      const s = get();
      const res = await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ participant_id: userId }),
      });
      if (!res.ok) throw new Error("fail");
      const conversation = await res.json();
      set((d) => {
        d.conversations.unshift(conversation);
      });
      await (api.selectConversation as (c: import("@/store/types").Conversation) => Promise<void>)(conversation);
    } catch {
      alert("خطا در ایجاد مکالمه");
    }
  };

  api.openContextMenu = (event: MouseEvent, message: ChatMessage) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const padding = 12;
    const menuWidth = 160;
    const menuHeight = Number(message.sender_id) === Number(get().userId) ? 104 : 56;
    let x = targetRect.left;
    let y = targetRect.bottom;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (x + menuWidth + padding > viewportWidth) x = viewportWidth - menuWidth - padding;
    if (x < padding) x = padding;
    if (y + menuHeight + padding > viewportHeight) y = targetRect.top - menuHeight;
    if (y < padding) y = padding;
    set((d) => {
      d.contextMenu = { show: true, x, y, message };
    });
  };

  api.closeContextMenu = () => {
    set((d) => {
      d.contextMenu = { show: false, x: 0, y: 0, message: null };
    });
  };

  api.openConversationMenu = (event: MouseEvent, conversation: import("@/store/types").Conversation) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const padding = 12;
    const menuWidth = 160;
    const menuHeight = 56;
    let x = targetRect.left;
    let y = targetRect.bottom;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (x + menuWidth + padding > viewportWidth) x = viewportWidth - menuWidth - padding;
    if (x < padding) x = padding;
    if (y + menuHeight + padding > viewportHeight) y = targetRect.top - menuHeight;
    if (y < padding) y = padding;
    set((d) => {
      d.conversationMenu = { show: true, x, y, conversation };
    });
  };

  api.closeConversationMenu = () => {
    set((d) => {
      d.conversationMenu = { show: false, x: 0, y: 0, conversation: null };
    });
  };

  api.deleteConversation = async (conversation: import("@/store/types").Conversation) => {
    if (!conversation?.id) {
      (api.closeConversationMenu as () => void)();
      return;
    }
    if (!confirm("آیا از حذف این مکالمه اطمینان دارید؟")) {
      (api.closeConversationMenu as () => void)();
      return;
    }
    try {
      const s = get();
      const res = await fetch(`${API_URL}/conversations/${conversation.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          (api.closeConversation as () => void)();
          await (api.loadConversations as () => Promise<void>)();
          return;
        }
        const errData = await res.json();
        throw new Error(errData.error || "fail");
      }
      set((d) => {
        d.conversations = d.conversations.filter((c) => c.id !== conversation.id);
        delete d.messages[conversation.user_id];
      });
      if (get().currentConversationId === conversation.user_id) {
        (api.closeConversation as () => void)();
      }
      await (api.loadConversations as () => Promise<void>)();
    } catch {
      alert("خطا در حذف مکالمه");
    } finally {
      (api.closeConversationMenu as () => void)();
    }
  };

  api.copyMessage = async () => {
    const message = get().contextMenu.message;
    if (!message?.content) {
      (api.closeContextMenu as () => void)();
      return;
    }
    const text = String(message.content);
    try {
      if (window.navigator.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(text);
      } else {
        (api.copyTextFallback as (t: string) => void)(text);
      }
      toast.success("کپی شد");
    } catch {
      try {
        (api.copyTextFallback as (t: string) => void)(text);
        toast.success("کپی شد");
      } catch {
        toast.error("کپی نشد");
      }
    }
    (api.closeContextMenu as () => void)();
  };

  api.copyTextFallback = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("copy failed");
  };

  api.deleteMessage = async () => {
    const message = get().contextMenu.message;
    if (!message?.id) {
      (api.closeContextMenu as () => void)();
      return;
    }
    if (!confirm("آیا از حذف این پیام اطمینان دارید؟")) {
      (api.closeContextMenu as () => void)();
      return;
    }
    try {
      const s = get();
      const res = await fetch(`${API_URL}/messages/${message.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "fail");
      }
      const cid = get().currentConversationId!;
      set((d) => {
        const arr = d.messages[cid];
        if (arr) {
          const ix = arr.findIndex((m) => m.id === message.id);
          if (ix !== -1) arr.splice(ix, 1);
        }
      });
    } catch {
      alert("خطا در حذف پیام");
    } finally {
      (api.closeContextMenu as () => void)();
    }
  };

  api.startCall = async () => {
    const s = get();
    if (s.activeCall || s.outgoingCall || s.incomingCall) return;
    if (s.currentConversationId === s.userId) return;
    const receiverId = s.currentConversationId!;
    set((d) => {
      d.outgoingCall = {
        receiver_id: receiverId,
        username: s.currentConversationUsername,
        displayName: s.currentConversationDisplayName,
        avatarUrl: s.currentConversationAvatarUrl,
        status: "calling",
      };
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      set((d) => {
        d.localStream = stream;
      });
      (api.setupPeerConnection as (id: number) => void)(receiverId);
      const pc = get().peerConnection!;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      get().ws!.send(
        JSON.stringify({
          type: "call_offer",
          receiver_id: receiverId,
          payload: { offer },
        })
      );
    } catch {
      alert("خطا در دسترسی به میکروفون");
      (api.endCall as () => void)();
    }
  };

  api.acceptCall = async () => {
    const ic = get().incomingCall;
    if (!ic) return;
    const senderId = ic.sender_id;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      set((d) => {
        d.localStream = stream;
      });
      (api.setupPeerConnection as (id: number) => void)(senderId);
      const pc = get().peerConnection!;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(ic.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      get().ws!.send(
        JSON.stringify({
          type: "call_answer",
          receiver_id: senderId,
          payload: { answer },
        })
      );
      set((d) => {
        d.activeCall = {
          user_id: senderId,
          username: ic.username,
          displayName: ic.displayName,
          avatar_url: ic.avatar_url,
        };
        d.incomingCall = null;
      });
      (api.startCallTimer as () => void)();
    } catch {
      alert("خطا در دسترسی به میکروفون");
      (api.rejectCall as () => void)();
    }
  };

  api.rejectCall = () => {
    const ic = get().incomingCall;
    if (!ic) return;
    get().ws!.send(
      JSON.stringify({
        type: "call_reject",
        receiver_id: ic.sender_id,
      })
    );
    (api.saveCallLogMessage as (uid: number, c: string) => void)(ic.sender_id, "تماس ناموفق");
    set((d) => {
      d.incomingCall = null;
    });
  };

  api.endCall = (isInitiator = true) => {
    const s = get();
    if (s.activeCall) {
      if (isInitiator) {
        get().ws!.send(
          JSON.stringify({
            type: "call_hangup",
            receiver_id: s.activeCall.user_id,
          })
        );
        const dur = s.callDuration ? ` (${s.callDuration})` : "";
        (api.saveCallLogMessage as (uid: number, c: string) => void)(
          s.activeCall.user_id,
          `تماس صوتی${dur}`
        );
      }
    } else if (s.outgoingCall) {
      if (isInitiator) {
        get().ws!.send(
          JSON.stringify({
            type: "call_hangup",
            receiver_id: s.outgoingCall.receiver_id,
          })
        );
        (api.saveCallLogMessage as (uid: number, c: string) => void)(
          s.outgoingCall.receiver_id,
          "تماس ناموفق"
        );
      }
    }
    if (s.peerConnection) {
      s.peerConnection.close();
      set((d) => {
        d.peerConnection = null;
      });
    }
    if (s.localStream) {
      s.localStream.getTracks().forEach((t) => t.stop());
      set((d) => {
        d.localStream = null;
      });
    }
    let ra = document.getElementById("remote-audio") as HTMLAudioElement | null;
    if (ra) ra.srcObject = null;
    (api.stopCallTimer as () => void)();
    set((d) => {
      d.activeCall = null;
      d.outgoingCall = null;
      d.incomingCall = null;
    });
  };

  api.setupPeerConnection = (otherUserId: number) => {
    const s = get();
    const pc = new RTCPeerConnection({ iceServers: s.iceServers });
    set((d) => {
      d.peerConnection = pc;
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        get().ws!.send(
          JSON.stringify({
            type: "ice_candidate",
            receiver_id: otherUserId,
            payload: { candidate: event.candidate },
          })
        );
      }
    };
    pc.ontrack = (event) => {
      set((d) => {
        d.remoteStream = event.streams[0];
      });
      let el = document.getElementById("remote-audio") as HTMLAudioElement | null;
      if (!el) {
        el = document.createElement("audio");
        el.id = "remote-audio";
        el.autoplay = true;
        document.body.appendChild(el);
      }
      el.srcObject = event.streams[0];
      void el.play().catch(() => {});
    };
  };

  api.startCallTimer = () => {
    set((d) => {
      d.callStartTime = Date.now();
    });
    const timer = setInterval(() => {
      const start = get().callStartTime;
      if (!start) return;
      const diff = Math.floor((Date.now() - start) / 1000);
      const minutes = Math.floor(diff / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (diff % 60).toString().padStart(2, "0");
      set((d) => {
        d.callDuration = `${minutes}:${seconds}`;
      });
    }, 1000);
    set((d) => {
      d.callTimer = timer;
    });
  };

  api.stopCallTimer = () => {
    const t = get().callTimer;
    if (t) clearInterval(t);
    set((d) => {
      d.callTimer = null;
      d.callDuration = "";
      d.callStartTime = null;
    });
  };

  api.saveCallLogMessage = (otherUserId: number, content: string) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "message", receiver_id: otherUserId, content }));
    }
  };

  return api;
}
