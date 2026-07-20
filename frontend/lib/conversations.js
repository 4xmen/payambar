/**
 * Payambar conversation helpers (shared by app.js and tests).
 *
 * Loaded as a classic script (sets globalThis.PayambarConversations).
 * Keep free of Vue — API + pure list/state helpers only.
 */
(function (global) {
    'use strict';

    const ENCRYPTED_PREVIEW_PLACEHOLDER = 'پیام رمزنگاری شده';

    function authHeaders(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function fetchConversations(apiUrl, token, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        const res = await doFetch(`${apiUrl}/conversations`, {
            headers: authHeaders(token),
        });
        return res;
    }

    async function createConversation(apiUrl, token, participantId, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        const res = await doFetch(`${apiUrl}/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(token),
            },
            body: JSON.stringify({ participant_id: participantId }),
        });
        if (!res.ok) throw new Error('Failed to create conversation');
        return res.json();
    }

    async function deleteConversation(apiUrl, token, conversationId, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        const res = await doFetch(`${apiUrl}/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: authHeaders(token),
        });
        return res;
    }

    function findByUserId(conversations, userId) {
        if (global.PayambarFuncs?.findExistingConversation) {
            return global.PayambarFuncs.findExistingConversation(conversations, userId);
        }
        return conversations.find((c) => c.user_id === userId);
    }

    function updateLastMessageAt(conversations, userId, timestamp) {
        if (!userId || !timestamp) return false;
        const idx = conversations.findIndex((c) => c.user_id === userId);
        if (idx === -1) return false;
        conversations[idx].last_message_at = timestamp;
        return true;
    }

    function bumpUnreadCount(conversations, userId) {
        const idx = conversations.findIndex((c) => c.user_id === userId);
        if (idx === -1) return false;
        conversations[idx].unread_count = (conversations[idx].unread_count || 0) + 1;
        return true;
    }

    function clearUnreadCount(conversations, userId) {
        const idx = conversations.findIndex((c) => c.user_id === userId);
        if (idx === -1) return false;
        conversations[idx].unread_count = 0;
        return true;
    }

    /**
     * True when the conversation list shows the encrypted placeholder and
     * there is no local decrypted preview yet.
     */
    function needsEncryptedPreviewHydration(conv, messagesByUser) {
        const preview = (conv?.last_message_preview || '').trim();
        if (preview !== ENCRYPTED_PREVIEW_PLACEHOLDER) return false;
        const localPreview = global.PayambarFuncs?.getConversationPreview
            ? global.PayambarFuncs.getConversationPreview(
                  { ...conv, last_message_preview: '' },
                  messagesByUser
              )
            : '';
        return !localPreview;
    }

    function conversationsNeedingPreviewHydration(conversations, messagesByUser) {
        return (conversations || []).filter((conv) =>
            needsEncryptedPreviewHydration(conv, messagesByUser)
        );
    }

    const PayambarConversations = {
        ENCRYPTED_PREVIEW_PLACEHOLDER,
        fetchConversations,
        createConversation,
        deleteConversation,
        findByUserId,
        updateLastMessageAt,
        bumpUnreadCount,
        clearUnreadCount,
        needsEncryptedPreviewHydration,
        conversationsNeedingPreviewHydration,
    };

    global.PayambarConversations = PayambarConversations;
})(typeof globalThis !== 'undefined' ? globalThis : window);
