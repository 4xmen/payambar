import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '@/composables/useAuth';
import { useConversations } from '@/composables/useConversations';
import { useMessages } from '@/composables/useMessages';
import { useToast } from '@/composables/useToast';
import { useE2EE } from '@/composables/useE2EE';

describe('Composables', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('useToast', () => {
    it('shows toast and hides after duration', () => {
      vi.useFakeTimers();
      const { toastText, isVisible, showToast } = useToast();
      showToast('پیام تست', 1000);
      expect(toastText.value).toBe('پیام تست');
      expect(isVisible.value).toBe(true);

      vi.advanceTimersByTime(1100);
      expect(isVisible.value).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('useAuth', () => {
    it('initializes auth and sets auth session', () => {
      const auth = useAuth();
      auth.clearAuth();
      expect(auth.isAuthed.value).toBe(false);

      auth.setAuth({
        token: 'test.jwt.token',
        user_id: 123,
        username: 'testuser',
        display_name: 'Test User',
      });

      expect(auth.isAuthed.value).toBe(true);
      expect(auth.userId.value).toBe(123);
      expect(auth.username.value).toBe('testuser');
      expect(auth.profileDisplayName.value).toBe('Test User');

      auth.clearAuth();
      expect(auth.isAuthed.value).toBe(false);
      expect(auth.token.value).toBeNull();
    });
  });

  describe('useConversations', () => {
    it('selects and filters conversations', () => {
      const {
        conversations,
        filteredConversations,
        searchQuery,
        selectConversation,
        closeConversation,
        currentConversationId,
        chatListOpen,
      } = useConversations();

      conversations.value = [
        { id: 1, user_id: 10, username: 'sadegh', display_name: 'صادق' },
        { id: 2, user_id: 20, username: 'ali', display_name: 'علی' },
      ];

      searchQuery.value = 'علی';
      expect(filteredConversations.value).toHaveLength(1);
      expect(filteredConversations.value[0].user_id).toBe(20);

      searchQuery.value = '';
      expect(filteredConversations.value).toHaveLength(2);

      selectConversation(conversations.value[0]);
      expect(currentConversationId.value).toBe(10);
      expect(chatListOpen.value).toBe(false);

      closeConversation();
      expect(currentConversationId.value).toBeNull();
      expect(chatListOpen.value).toBe(true);
    });
  });

  describe('useMessages', () => {
    it('adds optimistic text message and retrieves messages for user', () => {
      const {
        sendTextMessageOptimistic,
        getMessagesForUser,
      } = useMessages();

      const msg = sendTextMessageOptimistic({
        myUserId: 1,
        receiverId: 2,
        content: 'تست پیام',
        clientMessageId: 'client-1',
      });

      expect(msg.content).toBe('تست پیام');
      const userMessages = getMessagesForUser(2);
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].client_message_id).toBe('client-1');
    });

    it('handles pull to refresh gestures', async () => {
      const msgs = useMessages();
      const mockContainer = {
        scrollHeight: 1000,
        scrollTop: 800,
        clientHeight: 200,
      } as any;

      // When near bottom, pull-start activates
      msgs.handlePullStart(
        { touches: [{ clientY: 500 }] } as any,
        mockContainer,
        2
      );
      expect(msgs.pullToRefresh.pulling).toBe(true);

      // Move up (negative delta)
      msgs.handlePullMove({ touches: [{ clientY: 400 }] } as any);
      expect(msgs.pullToRefresh.currentY).toBe(100);

      // Release triggers refresh
      let refreshed = false;
      await msgs.handlePullEnd(async () => {
        refreshed = true;
      });
      expect(refreshed).toBe(true);
      expect(msgs.pullToRefresh.pulling).toBe(false);
    });
  });

  describe('useE2EE', () => {
    it('resets state properly', () => {
      const { e2ee, resetE2EEState } = useE2EE();
      e2ee.ready = true;
      e2ee.ownerUserId = 123;
      resetE2EEState();
      expect(e2ee.ready).toBe(false);
      expect(e2ee.ownerUserId).toBeNull();
    });
  });
});
