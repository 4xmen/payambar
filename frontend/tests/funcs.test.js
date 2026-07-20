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
});
