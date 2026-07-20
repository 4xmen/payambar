import { describe, it, expect, beforeAll, vi } from 'vitest';
import '../lib/messages.js';

const M = globalThis.PayambarMessages;

describe('PayambarMessages', () => {
    beforeAll(() => {
        expect(M).toBeDefined();
    });

    it('conversationPeerId picks the other user', () => {
        expect(M.conversationPeerId(1, 2, 1)).toBe(2);
        expect(M.conversationPeerId(1, 2, 2)).toBe(1);
    });

    it('builds optimistic text and ws payload', () => {
        const msg = M.buildOptimisticTextMessage({
            userId: 1,
            receiverId: 2,
            content: 'hi',
            clientMessageId: 'client-1',
            createdAt: '2026-01-01T00:00:00Z',
        });
        expect(msg).toMatchObject({
            client_message_id: 'client-1',
            sender_id: 1,
            receiver_id: 2,
            content: 'hi',
            status: 'sent',
        });

        const plain = M.buildWsTextPayload({
            receiverId: 2,
            content: 'hi',
            clientMessageId: 'client-1',
            encryptedPayload: null,
        });
        expect(plain.content).toBe('hi');

        const enc = M.buildWsTextPayload({
            receiverId: 2,
            content: 'hi',
            clientMessageId: 'client-1',
            encryptedPayload: { encrypted: true, ciphertext: 'x', iv: 'y' },
        });
        expect(enc.content).toBe('');
        expect(enc.encrypted).toBe(true);
        expect(enc.ciphertext).toBe('x');
    });

    it('applyIncomingMessage replaces optimistic client message', () => {
        const messages = {
            2: [
                {
                    client_message_id: 'temp-1',
                    content: 'hi',
                    status: 'sent',
                    sender_id: 1,
                    receiver_id: 2,
                },
            ],
        };
        const { convUser, created } = M.applyIncomingMessage(
            messages,
            1,
            {
                message_id: 99,
                sender_id: 1,
                receiver_id: 2,
                client_message_id: 'temp-1',
                status: 'delivered',
                created_at: '2026-01-01T00:00:00Z',
            },
            'hi'
        );
        expect(convUser).toBe(2);
        expect(created).toBe(false);
        expect(messages[2][0].id).toBe(99);
        expect(messages[2][0].status).toBe('delivered');
        expect(messages[2][0].content).toBe('hi');
    });

    it('applyIncomingMessage appends new peer message', () => {
        const messages = {};
        const { convUser, created } = M.applyIncomingMessage(
            messages,
            1,
            {
                message_id: 5,
                sender_id: 2,
                receiver_id: 1,
                status: 'sent',
                created_at: '2026-01-01T00:00:00Z',
                content: 'from peer',
            },
            'from peer'
        );
        expect(convUser).toBe(2);
        expect(created).toBe(true);
        expect(messages[2]).toHaveLength(1);
        expect(messages[2][0].content).toBe('from peer');
    });

    it('unreadIncomingIds and removeMessageById', () => {
        const list = [
            { id: 1, sender_id: 2, status: 'delivered' },
            { id: 2, sender_id: 1, status: 'sent' },
            { id: 3, sender_id: 2, status: 'read' },
        ];
        expect(M.unreadIncomingIds(list, 1)).toEqual([1]);
        const messages = { 9: [...list] };
        expect(M.removeMessageById(messages, 9, 2)).toBe(true);
        expect(messages[9].map((m) => m.id)).toEqual([1, 3]);
    });

    it('hasMoreMessages and fetchMessages url', async () => {
        expect(M.hasMoreMessages(new Array(50))).toBe(true);
        expect(M.hasMoreMessages(new Array(10))).toBe(false);
        const fetchFn = vi.fn(async () => ({ ok: true }));
        await M.fetchMessages('http://api', 'tok', { userId: 7, limit: 50, offset: 50 }, fetchFn);
        expect(fetchFn).toHaveBeenCalledWith(
            'http://api/messages?user_id=7&limit=50&offset=50',
            expect.objectContaining({ headers: { Authorization: 'Bearer tok' } })
        );
    });
});
