import { describe, it, expect } from 'vitest';
import * as PayambarConversations from '@/services/conversations';

describe('PayambarConversations', () => {
  describe('updateLastMessageAt, bumpUnreadCount, clearUnreadCount', () => {
    it('updates last message timestamp of conversation', () => {
      const convs = [{ id: 1, user_id: 10, username: 'u10', last_message_at: '2026-01-01' }];
      const updated = PayambarConversations.updateLastMessageAt(convs, 10, '2026-02-02');
      expect(updated).toBe(true);
      expect(convs[0].last_message_at).toBe('2026-02-02');
    });

    it('bumps and clears unread count', () => {
      const convs = [{ id: 1, user_id: 10, username: 'u10', unread_count: 0 }];
      PayambarConversations.bumpUnreadCount(convs, 10);
      expect(convs[0].unread_count).toBe(1);
      PayambarConversations.bumpUnreadCount(convs, 10);
      expect(convs[0].unread_count).toBe(2);
      PayambarConversations.clearUnreadCount(convs, 10);
      expect(convs[0].unread_count).toBe(0);
    });
  });

  describe('needsEncryptedPreviewHydration and conversationsNeedingPreviewHydration', () => {
    it('identifies conversations with placeholder encrypted preview when no local preview exists', () => {
      const convs = [
        { id: 1, user_id: 10, username: 'u10', last_message_preview: 'پیام رمزنگاری شده' },
        { id: 2, user_id: 20, username: 'u20', last_message_preview: 'Hello' },
      ];

      const needing = PayambarConversations.conversationsNeedingPreviewHydration(convs, {});
      expect(needing).toHaveLength(1);
      expect(needing[0].user_id).toBe(10);
    });

    it('returns empty when local decrypted preview is present', () => {
      const convs = [
        { id: 1, user_id: 10, username: 'u10', last_message_preview: 'پیام رمزنگاری شده' },
      ];
      const messages = {
        10: [{ id: 1, sender_id: 10, receiver_id: 1, content: 'Decrypted message', status: 'read', created_at: '' }],
      };

      const needing = PayambarConversations.conversationsNeedingPreviewHydration(convs, messages);
      expect(needing).toHaveLength(0);
    });
  });
});
