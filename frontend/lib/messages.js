/**
 * Payambar message helpers (shared by app.js and tests).
 *
 * Loaded as a classic script (sets globalThis.PayambarMessages).
 * Keep free of Vue — API + pure message-list helpers only.
 */
(function (global) {
    'use strict';

    const DEFAULT_PAGE_SIZE = 50;

    function authHeaders(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function fetchMessages(apiUrl, token, { userId, limit = DEFAULT_PAGE_SIZE, offset, beforeId } = {}, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        let url = `${apiUrl}/messages?user_id=${userId}&limit=${limit}`;
        if (offset != null) url += `&offset=${offset}`;
        if (beforeId) url += `&before_id=${beforeId}`;
        const res = await doFetch(url, { headers: authHeaders(token) });
        return res;
    }

    async function deleteMessage(apiUrl, token, messageId, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        const res = await doFetch(`${apiUrl}/messages/${messageId}`, {
            method: 'DELETE',
            headers: authHeaders(token),
        });
        return res;
    }

    function conversationPeerId(senderId, receiverId, myUserId) {
        return Number(senderId) === Number(myUserId) ? Number(receiverId) : Number(senderId);
    }

    function hasMoreMessages(page, pageSize = DEFAULT_PAGE_SIZE) {
        return (page || []).length >= pageSize;
    }

    function buildOptimisticTextMessage({
        userId,
        receiverId,
        content,
        clientMessageId,
        createdAt,
    }) {
        return {
            id: null,
            client_message_id: clientMessageId,
            sender_id: userId,
            receiver_id: receiverId,
            content,
            status: 'sent',
            created_at: createdAt || new Date().toISOString(),
        };
    }

    function buildWsTextPayload({ receiverId, content, clientMessageId, encryptedPayload }) {
        const payload = {
            type: 'message',
            receiver_id: receiverId,
            content: encryptedPayload ? '' : content,
            client_message_id: clientMessageId,
        };
        if (encryptedPayload) Object.assign(payload, encryptedPayload);
        return payload;
    }

    function buildMessageRecord(data, content) {
        return {
            id: data.message_id,
            sender_id: data.sender_id,
            receiver_id: data.receiver_id,
            content,
            status: data.status,
            created_at: data.created_at,
            client_message_id: data.client_message_id,
            file_name: data.file_name,
            file_url: data.file_url,
            file_content_type: data.file_content_type,
            encrypted: !!data.encrypted,
            e2ee_v: data.e2ee_v,
            alg: data.alg,
            sender_device_id: data.sender_device_id,
            key_id: data.key_id,
            iv: data.iv,
            ciphertext: data.ciphertext,
            aad: data.aad,
        };
    }

    function mergeFileFields(existing, data) {
        return {
            ...existing,
            status: data.status,
            file_name: data.file_name || existing.file_name,
            file_url: data.file_url || existing.file_url,
            file_content_type: data.file_content_type || existing.file_content_type,
        };
    }

    /**
     * Apply an incoming WS message event into messagesByUser.
     * Mutates messagesByUser. Returns { convUser, created }.
     */
    function applyIncomingMessage(messagesByUser, myUserId, data, content) {
        const convUser = conversationPeerId(data.sender_id, data.receiver_id, myUserId);
        if (!messagesByUser[convUser]) messagesByUser[convUser] = [];

        const list = messagesByUser[convUser];
        const incomingID = Number(data.message_id);
        const existingByID = list.findIndex((m) => Number(m.id) === incomingID);
        let created = false;

        if (data.client_message_id) {
            const idx = list.findIndex((m) => m.client_message_id === data.client_message_id);
            if (idx >= 0) {
                list[idx] = {
                    ...list[idx],
                    id: data.message_id,
                    status: data.status,
                    file_name: data.file_name || list[idx].file_name,
                    file_url: data.file_url || list[idx].file_url,
                    file_content_type: data.file_content_type || list[idx].file_content_type,
                };
            } else if (existingByID >= 0) {
                list[existingByID] = mergeFileFields(list[existingByID], data);
            } else {
                list.push(buildMessageRecord(data, content));
                created = true;
            }
        } else if (existingByID >= 0) {
            list[existingByID] = mergeFileFields(list[existingByID], data);
        } else {
            list.push(buildMessageRecord(data, content));
            created = true;
        }

        return { convUser, created };
    }

    function unreadIncomingIds(messages, myUserId) {
        return (messages || [])
            .filter(
                (msg) =>
                    Number(msg.sender_id) !== Number(myUserId) && msg.status !== 'read' && msg.id
            )
            .map((msg) => msg.id);
    }

    function removeMessageById(messagesByUser, convUserId, messageId) {
        const convMessages = messagesByUser[convUserId];
        if (!convMessages) return false;
        const idx = convMessages.findIndex((m) => m.id === messageId);
        if (idx === -1) return false;
        convMessages.splice(idx, 1);
        return true;
    }

    function upsertOfflineFileMessage(messagesByUser, receiverId, msg) {
        if (!messagesByUser[receiverId]) messagesByUser[receiverId] = [];
        const list = messagesByUser[receiverId];
        const existingIdx = list.findIndex((m) => Number(m.id) === Number(msg.id));
        if (existingIdx >= 0) {
            list[existingIdx] = { ...list[existingIdx], ...msg };
            return list[existingIdx];
        }
        list.push(msg);
        return msg;
    }

    function buildOfflineFileMessage({
        messageId,
        userId,
        receiverId,
        fileName,
        fileUrl,
        fileContentType,
        createdAt,
    }) {
        return {
            id: messageId,
            sender_id: userId,
            receiver_id: receiverId,
            content: `📎 ${fileName}`,
            file_name: fileName,
            file_url: fileUrl,
            file_content_type: fileContentType || '',
            status: 'sent',
            created_at: createdAt || new Date().toISOString(),
        };
    }

    const PayambarMessages = {
        DEFAULT_PAGE_SIZE,
        fetchMessages,
        deleteMessage,
        conversationPeerId,
        hasMoreMessages,
        buildOptimisticTextMessage,
        buildWsTextPayload,
        buildMessageRecord,
        applyIncomingMessage,
        unreadIncomingIds,
        removeMessageById,
        upsertOfflineFileMessage,
        buildOfflineFileMessage,
    };

    global.PayambarMessages = PayambarMessages;
})(typeof globalThis !== 'undefined' ? globalThis : window);
