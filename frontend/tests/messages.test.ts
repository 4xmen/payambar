import { describe, it, expect } from 'vitest';
import * as PayambarMessages from '@/services/messages';

describe('PayambarMessages', () => {
  describe('conversationPeerId', () => {
    it('returns the other user id regardless of who is sender/receiver', () => {
      expect(PayambarMessages.conversationPeerId(10, 20, 10)).toBe(20);
      expect(PayambarMessages.conversationPeerId(20, 10, 10)).toBe(20);
      expect(PayambarMessages.conversationPeerId('10', '20', '10')).toBe(20);
    });
  });

  describe('hasMoreMessages', () => {
    it('returns true when page size is reached', () => {
      const page = new Array(50).fill({ id: 1 }) as any[];
      expect(PayambarMessages.hasMoreMessages(page, 50)).toBe(true);
    });

    it('returns false when page size is less than limit', () => {
      const page = new Array(20).fill({ id: 1 }) as any[];
      expect(PayambarMessages.hasMoreMessages(page, 50)).toBe(false);
    });
  });

  describe('buildOptimisticTextMessage', () => {
    it('creates optimistic message with sent status', () => {
      const msg = PayambarMessages.buildOptimisticTextMessage({
        userId: 1,
        receiverId: 2,
        content: 'hello',
        clientMessageId: 'c-1',
        createdAt: '2026-02-23T10:00:00Z',
      });

      expect(msg).toEqual({
        id: null,
        client_message_id: 'c-1',
        sender_id: 1,
        receiver_id: 2,
        content: 'hello',
        status: 'sent',
        created_at: '2026-02-23T10:00:00Z',
      });
    });
  });

  describe('buildWsTextPayload', () => {
    it('builds plaintext payload when no encrypted payload provided', () => {
      const payload = PayambarMessages.buildWsTextPayload({
        receiverId: 2,
        content: 'secret',
        clientMessageId: 'c-1',
      });

      expect(payload).toEqual({
        type: 'message',
        receiver_id: 2,
        content: 'secret',
        client_message_id: 'c-1',
      });
    });

    it('builds encrypted payload with empty content field and merged envelope', () => {
      const payload = PayambarMessages.buildWsTextPayload({
        receiverId: 2,
        content: 'secret',
        clientMessageId: 'c-1',
        encryptedPayload: {
          encrypted: true,
          ciphertext: 'abc',
          iv: 'def',
        },
      });

      expect(payload).toEqual({
        type: 'message',
        receiver_id: 2,
        content: '',
        client_message_id: 'c-1',
        encrypted: true,
        ciphertext: 'abc',
        iv: 'def',
      });
    });
  });

  describe('applyIncomingMessage', () => {
    it('replaces optimistic message by client_message_id', () => {
      const messages: Record<number, any[]> = {
        2: [
          {
            id: null,
            client_message_id: 'c-1',
            sender_id: 1,
            receiver_id: 2,
            content: 'hello',
            status: 'sent',
          },
        ],
      };

      const result = PayambarMessages.applyIncomingMessage(
        messages,
        1,
        {
          message_id: 100,
          client_message_id: 'c-1',
          sender_id: 1,
          receiver_id: 2,
          status: 'sent',
        },
        'hello'
      );

      expect(result.convUser).toBe(2);
      expect(result.created).toBe(false);
      expect(messages[2][0].id).toBe(100);
    });

    it('adds new incoming message when not matched by client_message_id', () => {
      const messages: Record<number, any[]> = { 2: [] };
      const result = PayambarMessages.applyIncomingMessage(
        messages,
        1,
        {
          message_id: 101,
          sender_id: 2,
          receiver_id: 1,
          status: 'delivered',
          created_at: '2026-01-01',
        },
        'incoming text'
      );

      expect(result.convUser).toBe(2);
      expect(result.created).toBe(true);
      expect(messages[2]).toHaveLength(1);
      expect(messages[2][0].content).toBe('incoming text');
    });
  });

  describe('unreadIncomingIds and removeMessageById', () => {
    it('filters unread message ids sent by other users', () => {
      const list = [
        { id: 1, sender_id: 2, receiver_id: 1, content: 'a', status: 'delivered', created_at: '' },
        { id: 2, sender_id: 1, receiver_id: 2, content: 'b', status: 'delivered', created_at: '' },
        { id: 3, sender_id: 2, receiver_id: 1, content: 'c', status: 'read', created_at: '' },
        { id: 4, sender_id: 2, receiver_id: 1, content: 'd', status: 'delivered', created_at: '' },
      ];

      const ids = PayambarMessages.unreadIncomingIds(list, 1);
      expect(ids).toEqual([1, 4]);
    });

    it('removes message by id', () => {
      const messages = {
        2: [
          { id: 1, sender_id: 1, receiver_id: 2, content: 'a', status: 'sent', created_at: '' },
          { id: 2, sender_id: 1, receiver_id: 2, content: 'b', status: 'sent', created_at: '' },
        ],
      };

      const removed = PayambarMessages.removeMessageById(messages, 2, 1);
      expect(removed).toBe(true);
      expect(messages[2]).toHaveLength(1);
      expect(messages[2][0].id).toBe(2);
    });
  });
});
