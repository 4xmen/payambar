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

    const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    function toPersianDigits(value) {
        return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
    }

    function formatTime(value) {
        if (!value) return '';
        try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return '';
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return toPersianDigits(`${hours}:${minutes}`);
        } catch (e) {
            return '';
        }
    }

    function formatRecordingDuration(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const mins = Math.floor(total / 60).toString().padStart(2, '0');
        const secs = (total % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    function getMessageFileName(msg) {
        const fromName = (msg?.file_name || '').toLowerCase();
        if (fromName) return fromName;
        try {
            const url = String(msg?.file_url || '').split('?')[0];
            return url.toLowerCase();
        } catch (e) {
            return '';
        }
    }

    function isAudioMessage(msg) {
        if (!msg || !msg.file_url) return false;
        const fileName = getMessageFileName(msg);
        if (fileName.startsWith('voice-')) return true;
        const contentType =
            typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
        if (contentType.startsWith('audio/')) return true;
        return (
            fileName.endsWith('.webm') ||
            fileName.endsWith('.ogg') ||
            fileName.endsWith('.mp3') ||
            fileName.endsWith('.wav') ||
            fileName.endsWith('.m4a')
        );
    }

    function isImageMessage(msg) {
        if (!msg || !msg.file_url) return false;
        const contentType =
            typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
        if (contentType.startsWith('image/')) return true;
        const fileName = getMessageFileName(msg);
        return (
            fileName.endsWith('.jpg') ||
            fileName.endsWith('.jpeg') ||
            fileName.endsWith('.png') ||
            fileName.endsWith('.gif') ||
            fileName.endsWith('.webp') ||
            fileName.endsWith('.bmp') ||
            fileName.endsWith('.svg')
        );
    }

    function isVideoMessage(msg) {
        if (!msg || !msg.file_url) return false;
        if (isAudioMessage(msg)) return false;
        const contentType =
            typeof msg.file_content_type === 'string' ? msg.file_content_type.toLowerCase() : '';
        if (contentType.startsWith('video/')) return true;
        const fileName = getMessageFileName(msg);
        return (
            fileName.endsWith('.mp4') ||
            fileName.endsWith('.webm') ||
            fileName.endsWith('.mov') ||
            fileName.endsWith('.mkv') ||
            fileName.endsWith('.m4v')
        );
    }

    function getConversationPreview(conv, messagesByUser) {
        if (!conv) return '';
        const localMessages = (messagesByUser && messagesByUser[conv.user_id]) || [];
        const latest = localMessages[localMessages.length - 1];
        if (latest?.file_name) return latest.file_name;
        if (latest?.file_url) return 'فایل';
        if (latest?.content) return latest.content.trim();
        if (typeof conv.last_message_preview === 'string' && conv.last_message_preview.trim()) {
            return conv.last_message_preview.trim();
        }
        return '';
    }

    function shouldShowMessageStatus(msg, index, messages, userId) {
        if (!msg) return false;
        if (Number(msg.sender_id) !== Number(userId)) return false;
        const list = messages || [];
        for (let i = list.length - 1; i >= 0; i--) {
            if (Number(list[i]?.sender_id) === Number(userId)) {
                return i === index;
            }
        }
        return false;
    }

    function parseTimestamp(value) {
        if (!value) return 0;
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }

    function getConversationLastTimestamp(conv, messagesByUser) {
        if (!conv) return 0;
        const fromConversation = parseTimestamp(conv.last_message_at);
        const localMessages = (messagesByUser && messagesByUser[conv.user_id]) || [];
        let localMax = 0;
        for (const msg of localMessages) {
            const ts = parseTimestamp(msg?.created_at);
            if (ts > localMax) localMax = ts;
        }
        return Math.max(fromConversation, localMax);
    }

    function sortConversations(conversations, messagesByUser) {
        return [...conversations].sort(
            (a, b) =>
                getConversationLastTimestamp(b, messagesByUser) -
                getConversationLastTimestamp(a, messagesByUser)
        );
    }

    function sortConversationsInPlace(conversations, messagesByUser) {
        conversations.sort(
            (a, b) =>
                getConversationLastTimestamp(b, messagesByUser) -
                getConversationLastTimestamp(a, messagesByUser)
        );
        return conversations;
    }

    function normalizeSearchUser(user) {
        const userId = Number(user?.id);
        const username = typeof user?.username === 'string' ? user.username : '';
        const displayName = typeof user?.display_name === 'string' ? user.display_name : '';
        const avatarUrl = typeof user?.avatar_url === 'string' ? user.avatar_url : '';
        const isOnline = !!user?.is_online;
        return {
            id: userId,
            username,
            displayName,
            avatarUrl,
            isOnline,
            nameLabel: displayName || username || '?',
        };
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
        toPersianDigits,
        formatTime,
        formatRecordingDuration,
        getMessageFileName,
        isAudioMessage,
        isImageMessage,
        isVideoMessage,
        getConversationPreview,
        shouldShowMessageStatus,
        parseTimestamp,
        getConversationLastTimestamp,
        sortConversations,
        sortConversationsInPlace,
        normalizeSearchUser,
    };

    global.PayambarFuncs = PayambarFuncs;
})(typeof globalThis !== 'undefined' ? globalThis : window);
