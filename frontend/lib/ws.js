/**
 * Payambar WebSocket helpers (shared by app.js and tests).
 *
 * Loaded as a classic script (sets globalThis.PayambarWs).
 * Keep free of Vue — connection ownership and message handling stay in app.js.
 */
(function (global) {
    'use strict';

    const READY_CONNECTING = 0;
    const READY_OPEN = 1;

    function isTokenValid(token) {
        return typeof token === 'string' && !!token && token !== 'undefined' && token !== 'null';
    }

    function buildUrl(wsBaseUrl, token) {
        return `${wsBaseUrl}?token=${encodeURIComponent(token)}`;
    }

    /**
     * @param {number} attempt 1-based reconnect attempt count (after increment)
     */
    function reconnectDelay(attempt, baseDelay, maxDelay) {
        return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    }

    function shouldReconnect({ isAuthed, intentionalClose, attempts, maxAttempts }) {
        if (intentionalClose || !isAuthed) return false;
        return attempts < maxAttempts;
    }

    function canConnect({ isAuthed, token, existingWs }) {
        if (!isAuthed || !isTokenValid(token)) return false;
        if (
            existingWs &&
            (existingWs.readyState === READY_OPEN || existingWs.readyState === READY_CONNECTING)
        ) {
            return false;
        }
        return true;
    }

    function parseIncoming(eventData) {
        if (global.PayambarFuncs && typeof global.PayambarFuncs.parseWebSocketMessage === 'function') {
            return global.PayambarFuncs.parseWebSocketMessage(eventData);
        }
        try {
            return JSON.parse(eventData);
        } catch (e) {
            return null;
        }
    }

    /**
     * Create a WebSocket and wire callbacks. Caller owns the returned socket.
     */
    function createConnection({
        WebSocketImpl,
        wsUrl,
        token,
        onOpen,
        onMessage,
        onError,
        onClose,
    }) {
        const Impl = WebSocketImpl || global.WebSocket;
        const ws = new Impl(buildUrl(wsUrl, token));

        ws.onopen = () => {
            if (onOpen) onOpen();
        };

        ws.onmessage = (event) => {
            const data = parseIncoming(event.data);
            if (!data) {
                console.error('WebSocket parse error: invalid JSON');
                return;
            }
            if (onMessage) onMessage(data);
        };

        ws.onerror = (err) => {
            if (onError) onError(err);
        };

        ws.onclose = () => {
            if (onClose) onClose();
        };

        return ws;
    }

    const PayambarWs = {
        READY_CONNECTING,
        READY_OPEN,
        isTokenValid,
        buildUrl,
        reconnectDelay,
        shouldReconnect,
        canConnect,
        parseIncoming,
        createConnection,
    };

    global.PayambarWs = PayambarWs;
})(typeof globalThis !== 'undefined' ? globalThis : window);
