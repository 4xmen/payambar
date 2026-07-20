/**
 * Payambar auth helpers (shared by app.js and tests).
 *
 * Loaded as a classic script (sets globalThis.PayambarAuth).
 * Keep free of Vue — session persistence + API requests only.
 */
(function (global) {
    'use strict';

    const STORAGE_KEYS = {
        token: 'token',
        userId: 'userId',
        username: 'username',
        displayName: 'displayName',
    };

    function getFuncs() {
        return global.PayambarFuncs || null;
    }

    /**
     * @returns {{ token: string, userId: number, username: string, displayName: string } | null}
     */
    function loadStoredSession(storage) {
        const store = storage || global.localStorage;
        if (!store) return null;

        const token = store.getItem(STORAGE_KEYS.token);
        const userId = store.getItem(STORAGE_KEYS.userId);
        const username = store.getItem(STORAGE_KEYS.username);
        const displayName = store.getItem(STORAGE_KEYS.displayName) || '';

        const funcs = getFuncs();
        const valid = funcs
            ? funcs.isValidAuth(token, userId, username)
            : !!(token && token !== 'undefined' && token !== 'null' && userId && username);

        if (!valid) return null;

        return {
            token,
            userId: parseInt(userId, 10),
            username,
            displayName,
        };
    }

    function persistSession(storage, { token, userId, username, displayName }) {
        const store = storage || global.localStorage;
        store.setItem(STORAGE_KEYS.token, token);
        store.setItem(STORAGE_KEYS.userId, String(userId));
        store.setItem(STORAGE_KEYS.username, username);
        if (displayName !== undefined && displayName !== null) {
            store.setItem(STORAGE_KEYS.displayName, displayName);
        }
    }

    function clearSession(storage) {
        const store = storage || global.localStorage;
        store.clear();
    }

    /**
     * Client-side register form checks (before network).
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function validateRegister({ acceptRules, password, confirm }) {
        if (!acceptRules) {
            return { ok: false, error: 'لطفاً قوانین را بپذیرید.' };
        }
        if (password !== confirm) {
            return { ok: false, error: 'رمز‌عبورها مطابقت ندارند' };
        }
        return { ok: true };
    }

    async function postAuth(apiUrl, path, body, fetchFn) {
        const doFetch = fetchFn || global.fetch;
        const res = await doFetch(`${apiUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            let message = 'Request failed';
            try {
                const errBody = await res.json();
                message = errBody.error || message;
            } catch (e) {
                /* ignore */
            }
            throw new Error(message);
        }
        return res.json();
    }

    async function login(apiUrl, { username, password }, fetchFn) {
        return postAuth(apiUrl, '/auth/login', { username, password }, fetchFn);
    }

    async function register(apiUrl, { username, password }, fetchFn) {
        return postAuth(apiUrl, '/auth/register', { username, password }, fetchFn);
    }

    const PayambarAuth = {
        STORAGE_KEYS,
        loadStoredSession,
        persistSession,
        clearSession,
        validateRegister,
        login,
        register,
    };

    global.PayambarAuth = PayambarAuth;
})(typeof globalThis !== 'undefined' ? globalThis : window);
