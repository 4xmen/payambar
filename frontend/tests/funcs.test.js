import { describe, it, expect, beforeAll } from 'vitest';
import '../lib/funcs.js';

const F = globalThis.PayambarFuncs;

describe('PayambarFuncs', () => {
    beforeAll(() => {
        expect(F).toBeDefined();
    });

    describe('formatDate', () => {
        it('handles null, undefined, and empty string', () => {
            expect(F.formatDate(null)).toBe('');
            expect(F.formatDate(undefined)).toBe('');
            expect(F.formatDate('')).toBe('');
        });

        it('returns empty for Go zero time', () => {
            expect(F.formatDate('0001-01-01T00:00:00Z')).toBe('');
            expect(F.formatDate('0001-01-01T12:00:00Z')).toBe('');
        });

        it('returns empty for dates before year 2000', () => {
            expect(F.formatDate('1999-06-15T12:00:00Z')).toBe('');
        });

        it('returns non-empty relative string for a recent valid date', () => {
            const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            expect(F.formatDate(recent)).not.toBe('');
        });
    });

    describe('formatStatus', () => {
        it('shows double check for read', () => {
            expect(F.formatStatus({ status: 'read' })).toBe('✓✓');
        });

        it('shows single check for delivered', () => {
            expect(F.formatStatus({ status: 'delivered' })).toBe('✓');
        });

        it('shows nothing for sent or missing status', () => {
            expect(F.formatStatus({ status: 'sent' })).toBe('');
            expect(F.formatStatus({})).toBe('');
        });
    });

    describe('isValidAuth', () => {
        it('accepts valid auth data', () => {
            expect(F.isValidAuth('valid-token', '1', 'user')).toBe(true);
        });

        it('rejects invalid tokens and ids', () => {
            expect(F.isValidAuth('undefined', '1', 'user')).toBe(false);
            expect(F.isValidAuth('null', '1', 'user')).toBe(false);
            expect(F.isValidAuth('', '1', 'user')).toBe(false);
            expect(F.isValidAuth('token', 'abc', 'user')).toBe(false);
            expect(F.isValidAuth('token', '0', 'user')).toBe(false);
            expect(F.isValidAuth('token', '-1', 'user')).toBe(false);
            expect(F.isValidAuth('token', '1', '')).toBe(false);
        });
    });

    describe('parseWebSocketMessage', () => {
        it('parses valid JSON', () => {
            expect(F.parseWebSocketMessage('{"type":"message","content":"hello"}')).toEqual({
                type: 'message',
                content: 'hello',
            });
        });

        it('returns null for invalid JSON', () => {
            expect(F.parseWebSocketMessage('invalid json')).toBe(null);
            expect(F.parseWebSocketMessage('')).toBe(null);
        });
    });

    describe('findExistingConversation', () => {
        const conversations = [
            { id: 1, user_id: 10, username: 'alice' },
            { id: 2, user_id: 20, username: 'bob' },
            { id: 3, user_id: 11, username: 'charlie' },
        ];

        it('finds conversation by user_id', () => {
            expect(F.findExistingConversation(conversations, 10)).toEqual(conversations[0]);
        });

        it('returns undefined for missing user_id', () => {
            expect(F.findExistingConversation(conversations, 99)).toBeUndefined();
        });

        it('does not match conversation id with user_id', () => {
            expect(F.findExistingConversation(conversations, 1)).toBeUndefined();
        });
    });

    describe('filterConversations', () => {
        const conversations = [
            { id: 1, user_id: 10, username: 'alice', display_name: 'Alice A' },
            { id: 2, user_id: 20, username: 'bob', display_name: 'Bobby' },
            { id: 3, user_id: 11, username: 'charlie', display_name: 'Charlie' },
        ];

        it('empty query returns all', () => {
            expect(F.filterConversations(conversations, '').length).toBe(3);
        });

        it('filters by partial username case-insensitively', () => {
            expect(F.filterConversations(conversations, 'ali').length).toBe(1);
            expect(F.filterConversations(conversations, 'ALI').length).toBe(1);
        });

        it('filters by display_name', () => {
            expect(F.filterConversations(conversations, 'bobby').length).toBe(1);
        });

        it('no match returns empty array', () => {
            expect(F.filterConversations(conversations, 'xyz').length).toBe(0);
        });
    });

    describe('message list helpers', () => {
        it('updateMessageStatus updates existing message', () => {
            const messages = {
                10: [
                    { id: 1, content: 'hi', status: 'sent' },
                    { id: 2, content: 'hello', status: 'sent' },
                ],
                20: [{ id: 3, content: 'hey', status: 'delivered' }],
            };
            expect(F.updateMessageStatus(messages, 1, 'delivered')).toBe(true);
            expect(messages[10][0].status).toBe('delivered');
            expect(F.updateMessageStatus(messages, 999, 'read')).toBe(false);
        });

        it('addMessageToConversation creates and appends', () => {
            const newMessages = {};
            F.addMessageToConversation(newMessages, 5, { id: 1, content: 'test' });
            expect(newMessages[5]).toBeDefined();
            expect(newMessages[5].length).toBe(1);
            F.addMessageToConversation(newMessages, 5, { id: 2, content: 'test2' });
            expect(newMessages[5].length).toBe(2);
        });

        it('replaceMessageByClientId updates id and status', () => {
            const tempMessages = {
                10: [{ client_message_id: 'temp-123', content: 'hello', status: 'sending' }],
            };
            const replaced = F.replaceMessageByClientId(tempMessages, 10, 'temp-123', {
                message_id: 456,
                status: 'sent',
            });
            expect(replaced).toBe(true);
            expect(tempMessages[10][0].id).toBe(456);
            expect(tempMessages[10][0].status).toBe('sent');
            expect(tempMessages[10][0].content).toBe('hello');

            expect(
                F.replaceMessageByClientId(tempMessages, 10, 'non-existent', {
                    message_id: 789,
                    status: 'sent',
                })
            ).toBe(false);
        });
    });

    describe('formatTime and duration', () => {
        it('toPersianDigits converts ASCII digits', () => {
            expect(F.toPersianDigits('12:05')).toBe('۱۲:۰۵');
        });

        it('formatTime returns empty for invalid values', () => {
            expect(F.formatTime(null)).toBe('');
            expect(F.formatTime('not-a-date')).toBe('');
        });

        it('formatTime returns Persian digits for a valid date', () => {
            const result = F.formatTime('2026-01-25T14:05:00');
            expect(result).toMatch(/[۰-۹]{2}:[۰-۹]{2}/);
        });

        it('formatRecordingDuration pads mm:ss', () => {
            expect(F.formatRecordingDuration(0)).toBe('00:00');
            expect(F.formatRecordingDuration(65)).toBe('01:05');
            expect(F.formatRecordingDuration(125)).toBe('02:05');
        });
    });

    describe('message media helpers', () => {
        it('getMessageFileName prefers file_name then url path', () => {
            expect(F.getMessageFileName({ file_name: 'Photo.JPG' })).toBe('photo.jpg');
            expect(F.getMessageFileName({ file_url: '/files/a.PNG?x=1' })).toBe('/files/a.png');
            expect(F.getMessageFileName({})).toBe('');
        });

        it('detects audio, image, and video messages', () => {
            expect(
                F.isAudioMessage({ file_url: '/x', file_name: 'voice-1.webm', file_content_type: '' })
            ).toBe(true);
            expect(
                F.isAudioMessage({ file_url: '/x', file_name: 'clip.mp3', file_content_type: 'audio/mpeg' })
            ).toBe(true);
            expect(
                F.isImageMessage({ file_url: '/x', file_name: 'a.png', file_content_type: 'image/png' })
            ).toBe(true);
            expect(
                F.isImageMessage({ file_url: '/x', file_name: 'a.webp', file_content_type: '' })
            ).toBe(true);
            expect(
                F.isVideoMessage({ file_url: '/x', file_name: 'a.mp4', file_content_type: 'video/mp4' })
            ).toBe(true);
            expect(
                F.isVideoMessage({ file_url: '/x', file_name: 'voice-1.webm', file_content_type: '' })
            ).toBe(false);
            expect(F.isAudioMessage({})).toBe(false);
        });
    });

    describe('conversation preview and status', () => {
        it('getConversationPreview prefers local latest message', () => {
            const conv = { user_id: 10, last_message_preview: 'server preview' };
            const messages = {
                10: [{ content: ' local hi ' }],
            };
            expect(F.getConversationPreview(conv, messages)).toBe('local hi');
            expect(F.getConversationPreview(conv, {})).toBe('server preview');
            expect(
                F.getConversationPreview(conv, { 10: [{ file_url: '/f', file_name: '' }] })
            ).toBe('فایل');
            expect(
                F.getConversationPreview(conv, { 10: [{ file_name: 'doc.pdf' }] })
            ).toBe('doc.pdf');
        });

        it('shouldShowMessageStatus only for last outgoing message', () => {
            const list = [
                { sender_id: 1, status: 'sent' },
                { sender_id: 2, status: 'sent' },
                { sender_id: 1, status: 'delivered' },
            ];
            expect(F.shouldShowMessageStatus(list[0], 0, list, 1)).toBe(false);
            expect(F.shouldShowMessageStatus(list[2], 2, list, 1)).toBe(true);
            expect(F.shouldShowMessageStatus(list[1], 1, list, 1)).toBe(false);
        });
    });

    describe('conversation sorting', () => {
        it('parseTimestamp returns 0 for empty/invalid', () => {
            expect(F.parseTimestamp('')).toBe(0);
            expect(F.parseTimestamp(null)).toBe(0);
            expect(F.parseTimestamp('bad')).toBe(0);
        });

        it('sortConversations orders by latest local or conversation timestamp', () => {
            const conversations = [
                { user_id: 1, last_message_at: '2026-01-01T00:00:00Z' },
                { user_id: 2, last_message_at: '2026-01-02T00:00:00Z' },
            ];
            const messages = {
                1: [{ created_at: '2026-01-03T00:00:00Z' }],
            };
            const sorted = F.sortConversations(conversations, messages);
            expect(sorted[0].user_id).toBe(1);
            expect(sorted[1].user_id).toBe(2);
            expect(conversations[0].user_id).toBe(1);
        });

        it('sortConversationsInPlace mutates the array', () => {
            const conversations = [
                { user_id: 1, last_message_at: '2026-01-01T00:00:00Z' },
                { user_id: 2, last_message_at: '2026-01-05T00:00:00Z' },
            ];
            F.sortConversationsInPlace(conversations, {});
            expect(conversations[0].user_id).toBe(2);
        });
    });

    describe('normalizeSearchUser', () => {
        it('normalizes fields and nameLabel fallback', () => {
            expect(
                F.normalizeSearchUser({
                    id: '7',
                    username: 'ali',
                    display_name: 'Ali',
                    avatar_url: '/a.png',
                    is_online: 1,
                })
            ).toEqual({
                id: 7,
                username: 'ali',
                displayName: 'Ali',
                avatarUrl: '/a.png',
                isOnline: true,
                nameLabel: 'Ali',
            });
            expect(F.normalizeSearchUser({ id: 3, username: 'bob' }).nameLabel).toBe('bob');
            expect(F.normalizeSearchUser({}).nameLabel).toBe('?');
        });
    });
});
