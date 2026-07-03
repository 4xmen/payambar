import { API_URL } from "@/store/constants";

type G = () => import("@/store/initialState").MessengerDataState & Record<string, unknown>;
type S = (fn: (d: import("@/store/initialState").MessengerDataState) => void) => void;

export function authPart(set: S, get: G) {
  return {
    fetchAppVersion: async () => {
      try {
        const res = await fetch(`${API_URL}/version`);
        if (res.ok) {
          const data = await res.json();
          set((d) => {
            d.appVersion = data.version || "";
          });
        }
      } catch {
        /* noop */
      }
    },

    initAuth: () => {
      const storedToken = localStorage.getItem("token");
      const storedUserId = localStorage.getItem("userId");
      const storedUsername = localStorage.getItem("username");
      const storedDisplayName = localStorage.getItem("displayName");
      const isTokenValid = storedToken && storedToken !== "undefined" && storedToken !== "null";
      const isUserIdValid =
        storedUserId && !isNaN(parseInt(storedUserId, 10)) && parseInt(storedUserId, 10) > 0;
      if (isTokenValid && isUserIdValid && storedUsername) {
        set((d) => {
          d.token = storedToken;
          d.userId = parseInt(storedUserId!, 10);
          d.username = storedUsername;
          d.profileDisplayName = storedDisplayName || "";
        });
      } else {
        localStorage.clear();
      }
    },

    handleLogin: async () => {
      set((d) => {
        d.authError = "";
      });
      const login = get().login;
      try {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: login.username, password: login.password }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Login failed");
        }
        const data = await res.json();
        set((d) => {
          d.authPassword = login.password;
          d.suppressBackupWarningOnce = false;
        });
        await (get().setAuth as (x: AuthPayload) => Promise<void>)(data);
      } catch (e) {
        set((d) => {
          d.authError = e instanceof Error ? e.message : "خطا";
        });
      }
    },

    handleRegister: async () => {
      const st = get();
      set((d) => {
        d.authError = "";
      });
      if (!st.acceptRules) {
        set((d) => {
          d.authError = "لطفاً قوانین را بپذیرید.";
        });
        return;
      }
      if (st.register.password !== st.register.confirm) {
        set((d) => {
          d.authError = "رمز‌عبورها مطابقت ندارند";
        });
        return;
      }
      try {
        const res = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: st.register.username, password: st.register.password }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Registration failed");
        }
        const data = await res.json();
        set((d) => {
          d.authPassword = st.register.password;
          d.suppressBackupWarningOnce = true;
        });
        await (get().setAuth as (x: AuthPayload) => Promise<void>)(data);
      } catch (e) {
        set((d) => {
          d.authError = e instanceof Error ? e.message : "خطا";
        });
      }
    },

    setAuth: async (data: AuthPayload) => {
      (get().closeWebSocket as (i?: boolean) => void)(true);
      if (Number(get().userId) !== Number(data.user_id)) {
        (get().resetE2EEState as () => void)();
      }
      set((d) => {
        d.token = data.token;
        d.userId = data.user_id;
        d.username = data.username;
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("userId", String(data.user_id));
      localStorage.setItem("username", data.username);
      await (get().loadConversations as () => Promise<void>)();
      await (get().loadMyProfile as () => Promise<void>)();
      void (get().ensureE2EEReady as () => Promise<boolean>)().catch(() => {});
      void (get().fetchWebRTCConfig as () => Promise<void>)();
      (get().connectWebSocket as () => void)();
    },

    clearAuth: () => {
      (get().resetE2EEState as () => void)();
      set((d) => {
        d.token = null;
        d.userId = null;
        d.username = null;
        d.acceptRules = false;
        d.authPassword = "";
        d.conversations = [];
        d.messages = {};
        d.currentConversationId = null;
        d.currentConversationUsername = "";
        d.currentConversationDisplayName = "";
        d.currentConversationAvatarUrl = null;
        d.currentConversationIsOnline = false;
        d.showProfileModal = false;
        d.activeProfileTab = "profile";
        d.profileDisplayName = "";
        d.myAvatarUrl = null;
        d.deleteAccountConfirm = "";
        d.deletingAccount = false;
        d.showNewChatModal = false;
        d.newChatSearchQuery = "";
        d.newChatSearchResults = [];
        d.newChatSearchLoading = false;
        d.newChatSearchError = "";
      });
      const to = get().newChatSearchTimeout;
      if (to) {
        clearTimeout(to);
        set((d) => {
          d.newChatSearchTimeout = null;
        });
      }
      localStorage.clear();
      (get().cleanupVoiceRecorder as () => void)();
      set((d) => {
        d.contextMenu = { show: false, x: 0, y: 0, message: null };
        d.conversationMenu = { show: false, x: 0, y: 0, conversation: null };
        d.serverOffline = false;
        d.wsReconnectAttempts = 0;
      });
      (get().closeWebSocket as (i?: boolean) => void)(true);
    },

    handleLogout: () => {
      if (confirm("آیا از خروج اطمینان دارید؟")) {
        (get().clearAuth as () => void)();
      }
    },
  };
}

type AuthPayload = { token: string; user_id: number; username: string };
