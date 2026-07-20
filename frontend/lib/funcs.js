/**
 * Payambar pure app helpers (shared by app.js and tests).
 *
 * Loaded as a classic script in the browser (sets globalThis.PayambarFuncs)
 * and imported as a side-effect module in Vitest (same global).
 *
 * Keep this free of Vue, fetch, and localStorage.
 */
(function (global) {
    'use strict';

    function isValidAuth(token, userId, username) {
        const isTokenValid = token && token !== 'undefined' && token !== 'null';
        const isUserIdValid = userId && !isNaN(parseInt(userId)) && parseInt(userId) > 0;
        return !!(isTokenValid && isUserIdValid && username);
    }

    function parseWebSocketMessage(eventData) {
        try {
            return JSON.parse(eventData);
        } catch (e) {
            return null;
        }
    }

    function findExistingConversation(conversations, userId) {
        return conversations.find((c) => c.user_id === userId);
    }

    function filterConversations(conversations, query) {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter(
            (c) =>
                c.username?.toLowerCase().includes(q) ||
                c.display_name?.toLowerCase().includes(q)
        );
    }

    function updateMessageStatus(messages, messageId, newStatus) {
        const allMsgs = Object.values(messages).flat();
        const msg = allMsgs.find((m) => m.id === messageId);
        if (msg) {
            msg.status = newStatus;
            return true;
        }
        return false;
    }

    function addMessageToConversation(messages, convUserId, message) {
        if (!messages[convUserId]) {
            messages[convUserId] = [];
        }
        messages[convUserId].push(message);
    }

    function replaceMessageByClientId(messages, convUserId, clientMessageId, serverMessage) {
        if (!messages[convUserId]) return false;
        const idx = messages[convUserId].findIndex(
            (m) => m.client_message_id === clientMessageId
        );
        if (idx >= 0) {
            messages[convUserId][idx] = {
                ...messages[convUserId][idx],
                id: serverMessage.message_id,
                status: serverMessage.status,
            };
            return true;
        }
        return false;
    }

    /**
     * Relative Persian time formatting — matches app.js formatDate.
     */
    function formatDate(value) {
        if (!value) return '';
        try {
            if (value === '0001-01-01T00:00:00Z' || value.startsWith('0001-01-01')) {
                return '';
            }

            const date = new Date(value);
            if (isNaN(date.getTime())) return '';

            if (date.getFullYear() < 2000) return '';

            const now = new Date();
            const diffMs = now - date;

            if (diffMs < 0 || diffMs > 10 * 365 * 24 * 60 * 60 * 1000) {
                return '';
            }

            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);
            const diffWeeks = Math.floor(diffDays / 7);
            const diffMonths = Math.floor(diffDays / 30);
            const diffYears = Math.floor(diffDays / 365);

            const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });

            if (diffSeconds < 60) {
                return rtf.format(-diffSeconds, 'second');
            } else if (diffMinutes < 60) {
                return rtf.format(-diffMinutes, 'minute');
            } else if (diffHours < 24) {
                return rtf.format(-diffHours, 'hour');
            } else if (diffDays < 7) {
                return rtf.format(-diffDays, 'day');
            } else if (diffWeeks < 4) {
                return rtf.format(-diffWeeks, 'week');
            } else if (diffMonths < 12) {
                return rtf.format(-diffMonths, 'month');
            } else {
                return rtf.format(-diffYears, 'year');
            }
        } catch (e) {
            return '';
        }
    }

    function formatStatus(msg) {
        if (msg.status === 'read') return '✓✓';
        if (msg.status === 'delivered') return '✓';
        return '';
    }

    const PayambarFuncs = {
        isValidAuth,
        parseWebSocketMessage,
        findExistingConversation,
        filterConversations,
        updateMessageStatus,
        addMessageToConversation,
        replaceMessageByClientId,
        formatDate,
        formatStatus,
    };

    global.PayambarFuncs = PayambarFuncs;
})(typeof globalThis !== 'undefined' ? globalThis : window);
