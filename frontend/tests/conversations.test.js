import { describe, it, expect, beforeAll, vi } from 'vitest';
import '../lib/funcs.js';
import '../lib/conversations.js';

const C = globalThis.PayambarConversations;

describe('PayambarConversations', () => {
    beforeAll(() => {
        expect(C).toBeDefined();
    });

    it('updateLastMessageAt and unread helpers', () => {
        const conversations = [
            { user_id: 10, last_message_at: '2026-01-01T00:00:00Z', unread_count: 0 },
            { user_id: 20, last_message_at: '2026-01-02T00:00:00Z', unread_count: 1 },
        ];
        expect(C.updateLastMessageAt(conversations, 10, '2026-01-05T00:00:00Z')).toBe(true);
        expect(conversations[0].last_message_at).toBe('2026-01-05T00:00:00Z');
        expect(C.bumpUnreadCount(conversations, 10)).toBe(true);
        expect(conversations[0].unread_count).toBe(1);
        expect(C.clearUnreadCount(conversations, 10)).toBe(true);
        expect(conversations[0].unread_count).toBe(0);
        expect(C.findByUserId(conversations, 20)).toEqual(conversations[1]);
    });

    it('needsEncryptedPreviewHydration detects placeholder without local preview', () => {
        const conv = {
            user_id: 10,
            last_message_preview: 'پیام رمزنگاری شده',
        };
        expect(C.needsEncryptedPreviewHydration(conv, {})).toBe(true);
        expect(
            C.needsEncryptedPreviewHydration(conv, {
                10: [{ content: 'hello' }],
            })
        ).toBe(false);
        expect(
            C.needsEncryptedPreviewHydration(
                { user_id: 10, last_message_preview: 'hi' },
                {}
            )
        ).toBe(false);
    });

    it('fetchConversations and createConversation call API', async () => {
        const fetchFn = vi.fn(async (url, opts) => {
            if (opts?.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({ id: 1, user_id: 9 }),
                };
            }
            return { ok: true, status: 200 };
        });
        await C.fetchConversations('http://api', 'tok', fetchFn);
        expect(fetchFn).toHaveBeenCalledWith(
            'http://api/conversations',
            expect.objectContaining({ headers: { Authorization: 'Bearer tok' } })
        );
        const created = await C.createConversation('http://api', 'tok', 9, fetchFn);
        expect(created.user_id).toBe(9);
    });
});
