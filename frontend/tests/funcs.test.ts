import { describe, it, expect } from 'vitest';
import * as PayambarFuncs from '@/services/funcs';

describe('PayambarFuncs', () => {
  describe('isValidAuth', () => {
    it('returns true for complete valid auth session', () => {
      expect(PayambarFuncs.isValidAuth('jwt.token.here', 12, 'alice')).toBe(true);
      expect(PayambarFuncs.isValidAuth('jwt.token.here', '12', 'alice')).toBe(true);
    });

    it('returns false when token is missing or stringified null/undefined', () => {
      expect(PayambarFuncs.isValidAuth('', 12, 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth(null, 12, 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth('null', 12, 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth('undefined', 12, 'alice')).toBe(false);
    });

    it('returns false when userId is invalid or not positive integer', () => {
      expect(PayambarFuncs.isValidAuth('token', 0, 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth('token', -5, 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth('token', 'abc', 'alice')).toBe(false);
      expect(PayambarFuncs.isValidAuth('token', null, 'alice')).toBe(false);
    });

    it('returns false when username is missing', () => {
      expect(PayambarFuncs.isValidAuth('token', 12, '')).toBe(false);
      expect(PayambarFuncs.isValidAuth('token', 12, null)).toBe(false);
    });
  });

  describe('parseWebSocketMessage', () => {
    it('parses valid JSON string into object', () => {
      const parsed = PayambarFuncs.parseWebSocketMessage('{"type":"message","id":1}');
      expect(parsed).toEqual({ type: 'message', id: 1 });
    });

    it('returns null on malformed JSON payload', () => {
      expect(PayambarFuncs.parseWebSocketMessage('invalid json')).toBeNull();
      expect(PayambarFuncs.parseWebSocketMessage('')).toBeNull();
    });
  });

  describe('findExistingConversation', () => {
    const list = [
      { id: 1, user_id: 10, username: 'u10' },
      { id: 2, user_id: 20, username: 'u20' },
    ];

    it('finds conversation by user_id', () => {
      expect(PayambarFuncs.findExistingConversation(list, 20)).toEqual({
        id: 2,
        user_id: 20,
        username: 'u20',
      });
    });

    it('returns undefined when not found', () => {
      expect(PayambarFuncs.findExistingConversation(list, 99)).toBeUndefined();
    });
  });

  describe('filterConversations', () => {
    const conversations = [
      { id: 1, user_id: 1, username: 'sadegh', display_name: 'صادق' },
      { id: 2, user_id: 2, username: 'reza', display_name: 'رضا' },
      { id: 3, user_id: 3, username: 'maryam', display_name: '' },
    ];

    it('returns all conversations when query is empty', () => {
      expect(PayambarFuncs.filterConversations(conversations, '')).toEqual(conversations);
      expect(PayambarFuncs.filterConversations(conversations, '   ')).toEqual(conversations);
    });

    it('filters by username case-insensitively', () => {
      const res = PayambarFuncs.filterConversations(conversations, 'REZ');
      expect(res).toHaveLength(1);
      expect(res[0].username).toBe('reza');
    });

    it('filters by display_name', () => {
      const res = PayambarFuncs.filterConversations(conversations, 'صاد');
      expect(res).toHaveLength(1);
      expect(res[0].user_id).toBe(1);
    });
  });

  describe('updateMessageStatus', () => {
    it('updates status of matched message and returns true', () => {
      const messages = {
        2: [
          { id: 101, sender_id: 1, receiver_id: 2, content: 'a', status: 'sent', created_at: '' },
          { id: 102, sender_id: 1, receiver_id: 2, content: 'b', status: 'sent', created_at: '' },
        ],
      };
      const updated = PayambarFuncs.updateMessageStatus(messages, 102, 'delivered');
      expect(updated).toBe(true);
      expect(messages[2][1].status).toBe('delivered');
    });

    it('returns false if message is not present', () => {
      const messages = { 2: [] };
      expect(PayambarFuncs.updateMessageStatus(messages, 999, 'read')).toBe(false);
    });
  });

  describe('addMessageToConversation', () => {
    it('creates bucket if needed and pushes message', () => {
      const messages: Record<number, any[]> = {};
      PayambarFuncs.addMessageToConversation(messages, 5, {
        id: 1,
        sender_id: 1,
        receiver_id: 5,
        content: 'hi',
        status: 'sent',
        created_at: '2026-01-01',
      });
      expect(messages[5]).toHaveLength(1);
      expect(messages[5][0].content).toBe('hi');
    });
  });

  describe('replaceMessageByClientId', () => {
    it('replaces client message with server id and status', () => {
      const messages = {
        2: [
          {
            id: null,
            client_message_id: 'client-123',
            sender_id: 1,
            receiver_id: 2,
            content: 'hi',
            status: 'sent',
            created_at: '',
          },
        ],
      };
      const ok = PayambarFuncs.replaceMessageByClientId(messages, 2, 'client-123', {
        message_id: 50,
        status: 'delivered',
      });
      expect(ok).toBe(true);
      expect(messages[2][0].id).toBe(50);
      expect(messages[2][0].status).toBe('delivered');
    });
  });

  describe('formatStatus', () => {
    it('maps status correctly', () => {
      expect(PayambarFuncs.formatStatus({ status: 'read' })).toBe('✓✓');
      expect(PayambarFuncs.formatStatus({ status: 'delivered' })).toBe('✓');
      expect(PayambarFuncs.formatStatus({ status: 'sent' })).toBe('✓');
      expect(PayambarFuncs.formatStatus(null)).toBe('');
    });
  });

  describe('formatDate', () => {
    it('returns empty string for zero/invalid values', () => {
      expect(PayambarFuncs.formatDate('')).toBe('');
      expect(PayambarFuncs.formatDate('0001-01-01T00:00:00Z')).toBe('');
      expect(PayambarFuncs.formatDate('not-a-date')).toBe('');
      expect(PayambarFuncs.formatDate('1990-01-01T00:00:00Z')).toBe('');
    });

    it('returns relative Persian format for valid recent timestamps', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const formatted = PayambarFuncs.formatDate(fiveMinutesAgo);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatTime and toPersianDigits', () => {
    it('converts ascii digits to Persian digits', () => {
      expect(PayambarFuncs.toPersianDigits('12:34')).toBe('۱۲:۳۴');
    });

    it('formats time with Persian digits', () => {
      const formatted = PayambarFuncs.formatTime('2026-02-23T10:20:00Z');
      expect(formatted).toMatch(/^[۰-۹]{2}:[۰-۹]{2}$/);
    });

    it('returns empty string for invalid timestamp', () => {
      expect(PayambarFuncs.formatTime('')).toBe('');
      expect(PayambarFuncs.formatTime('invalid')).toBe('');
    });
  });

  describe('formatRecordingDuration', () => {
    it('formats seconds into mm:ss format', () => {
      expect(PayambarFuncs.formatRecordingDuration(0)).toBe('00:00');
      expect(PayambarFuncs.formatRecordingDuration(9)).toBe('00:09');
      expect(PayambarFuncs.formatRecordingDuration(65)).toBe('01:05');
      expect(PayambarFuncs.formatRecordingDuration(-5)).toBe('00:00');
    });
  });

  describe('media detection helpers', () => {
    it('identifies audio messages by url, name, or content type', () => {
      expect(PayambarFuncs.isAudioMessage({ file_url: '/a.mp3' })).toBe(true);
      expect(PayambarFuncs.isAudioMessage({ file_url: '/x', file_name: 'voice-1.ogg' })).toBe(true);
      expect(PayambarFuncs.isAudioMessage({ file_url: '/x', file_content_type: 'audio/webm' })).toBe(true);
      expect(PayambarFuncs.isAudioMessage({ file_url: '/a.png' })).toBe(false);
    });

    it('identifies image messages', () => {
      expect(PayambarFuncs.isImageMessage({ file_url: '/a.png' })).toBe(true);
      expect(PayambarFuncs.isImageMessage({ file_url: '/x', file_name: 'pic.jpg' })).toBe(true);
      expect(PayambarFuncs.isImageMessage({ file_url: '/x', file_content_type: 'image/webp' })).toBe(true);
      expect(PayambarFuncs.isImageMessage({ file_url: '/a.mp4' })).toBe(false);
    });

    it('identifies video messages', () => {
      expect(PayambarFuncs.isVideoMessage({ file_url: '/a.mp4' })).toBe(true);
      expect(PayambarFuncs.isVideoMessage({ file_url: '/x', file_name: 'clip.mp4' })).toBe(true);
      expect(PayambarFuncs.isVideoMessage({ file_url: '/x', file_content_type: 'video/webm' })).toBe(true);
      expect(PayambarFuncs.isVideoMessage({ file_url: '/a.mov' })).toBe(true);
      expect(PayambarFuncs.isVideoMessage({ file_url: '/a.mp3' })).toBe(false);
    });
  });

  describe('getConversationPreview', () => {
    it('prioritizes local latest message content', () => {
      const conv = { id: 1, user_id: 2, username: 'u2', last_message_preview: 'old preview' };
      const messages = {
        2: [
          { id: 1, sender_id: 1, receiver_id: 2, content: 'latest message', status: 'sent', created_at: '' },
        ],
      };
      expect(PayambarFuncs.getConversationPreview(conv, messages)).toBe('latest message');
    });

    it('falls back to file preview when latest has file', () => {
      const conv = { id: 1, user_id: 2, username: 'u2' };
      const messages = {
        2: [
          { id: 1, sender_id: 1, receiver_id: 2, content: '', file_url: '/a.pdf', file_name: 'doc.pdf', status: 'sent', created_at: '' },
        ],
      };
      expect(PayambarFuncs.getConversationPreview(conv, messages)).toBe('doc.pdf');
    });

    it('falls back to conversation last_message_preview if no local messages', () => {
      const conv = { id: 1, user_id: 2, username: 'u2', last_message_preview: 'backend preview' };
      expect(PayambarFuncs.getConversationPreview(conv, {})).toBe('backend preview');
    });
  });

  describe('shouldShowMessageStatus', () => {
    it('shows status only on sender latest sent message', () => {
      const messages = [
        { id: 1, sender_id: 10, receiver_id: 20, content: '1', status: 'read', created_at: '' },
        { id: 2, sender_id: 20, receiver_id: 10, content: '2', status: 'read', created_at: '' },
        { id: 3, sender_id: 10, receiver_id: 20, content: '3', status: 'delivered', created_at: '' },
      ];

      expect(PayambarFuncs.shouldShowMessageStatus(messages[0], 0, messages, 10)).toBe(false);
      expect(PayambarFuncs.shouldShowMessageStatus(messages[1], 1, messages, 10)).toBe(false);
      expect(PayambarFuncs.shouldShowMessageStatus(messages[2], 2, messages, 10)).toBe(true);
    });
  });

  describe('sortConversations and in-place sort', () => {
    it('sorts conversations by latest timestamp descending', () => {
      const convs = [
        { id: 1, user_id: 1, username: 'u1', last_message_at: '2026-01-01T10:00:00Z' },
        { id: 2, user_id: 2, username: 'u2', last_message_at: '2026-01-02T10:00:00Z' },
      ];
      const sorted = PayambarFuncs.sortConversations(convs);
      expect(sorted[0].user_id).toBe(2);
      expect(sorted[1].user_id).toBe(1);
    });

    it('sorts in place', () => {
      const convs = [
        { id: 1, user_id: 1, username: 'u1', last_message_at: '2026-01-01T10:00:00Z' },
        { id: 2, user_id: 2, username: 'u2', last_message_at: '2026-01-03T10:00:00Z' },
      ];
      PayambarFuncs.sortConversationsInPlace(convs);
      expect(convs[0].user_id).toBe(2);
      expect(convs[1].user_id).toBe(1);
    });
  });

  describe('normalizeSearchUser', () => {
    it('normalizes API search user record', () => {
      const normalized = PayambarFuncs.normalizeSearchUser({
        id: '12',
        username: 'alice',
        display_name: 'Alice Wonder',
        avatar_url: '/a.png',
        is_online: 1,
      });

      expect(normalized).toEqual({
        id: 12,
        username: 'alice',
        displayName: 'Alice Wonder',
        avatarUrl: '/a.png',
        isOnline: true,
        nameLabel: 'Alice Wonder',
      });
    });
  });
});
