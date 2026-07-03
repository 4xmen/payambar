import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { initialState } from "@/store/initialState";
import { e2eePart } from "@/store/methods/e2eePart";
import { authPart } from "@/store/methods/authPart";
import { runtimePart } from "@/store/methods/runtimePart";

export const useMessenger = create(
  immer((set, get) => ({
    ...initialState,
    ...e2eePart(set, get),
    ...authPart(set, get),
    ...runtimePart(set, get),
    bootstrap: () => {
      const g = get() as Record<string, (...args: unknown[]) => unknown>;
      void g.fetchAppVersion?.();
      g.initAuth?.();
      const s = get();
      if (s.token && s.userId && s.userId > 0) {
        void (g.loadConversations as () => Promise<void>)?.();
        void (g.loadMyProfile as () => Promise<void>)?.();
        void (g.ensureE2EEReady as () => Promise<boolean>)?.().catch(() => {});
        void (g.fetchWebRTCConfig as () => Promise<void>)?.();
        (g.connectWebSocket as () => void)?.();
        void (g.restorePushSubscription as () => Promise<void>)?.();
      }
    },
  }))
);
