import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import '../lib/funcs.js';
import '../lib/auth.js';

const Auth = globalThis.PayambarAuth;

function memoryStorage() {
    const store = {};
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => {
            store[k] = String(v);
        },
        clear: () => {
            Object.keys(store).forEach((k) => delete store[k]);
        },
        _raw: store,
    };
}

describe('PayambarAuth', () => {
    beforeAll(() => {
        expect(Auth).toBeDefined();
    });

    describe('session storage', () => {
        let storage;

        beforeEach(() => {
            storage = memoryStorage();
        });

        it('loadStoredSession returns null for invalid data', () => {
            expect(Auth.loadStoredSession(storage)).toBe(null);
            storage.setItem('token', 'undefined');
            storage.setItem('userId', '1');
            storage.setItem('username', 'u');
            expect(Auth.loadStoredSession(storage)).toBe(null);
        });

        it('persist and load roundtrip', () => {
            Auth.persistSession(storage, {
                token: 't1',
                userId: 42,
                username: 'ali',
                displayName: 'Ali',
            });
            expect(Auth.loadStoredSession(storage)).toEqual({
                token: 't1',
                userId: 42,
                username: 'ali',
                displayName: 'Ali',
            });
        });

        it('clearSession wipes storage', () => {
            Auth.persistSession(storage, { token: 't', userId: 1, username: 'u' });
            Auth.clearSession(storage);
            expect(Auth.loadStoredSession(storage)).toBe(null);
            expect(Object.keys(storage._raw).length).toBe(0);
        });
    });

    describe('validateRegister', () => {
        it('requires accepted rules and matching passwords', () => {
            expect(
                Auth.validateRegister({ acceptRules: false, password: 'a', confirm: 'a' })
            ).toEqual({ ok: false, error: 'لطفاً قوانین را بپذیرید.' });
            expect(
                Auth.validateRegister({ acceptRules: true, password: 'a', confirm: 'b' })
            ).toEqual({ ok: false, error: 'رمز‌عبورها مطابقت ندارند' });
            expect(
                Auth.validateRegister({ acceptRules: true, password: 'a', confirm: 'a' })
            ).toEqual({ ok: true });
        });
    });

    describe('login / register API', () => {
        it('login posts credentials and returns json', async () => {
            const fetchFn = vi.fn(async () => ({
                ok: true,
                json: async () => ({ token: 'tok', user_id: 1, username: 'ali' }),
            }));
            const data = await Auth.login(
                'http://api',
                { username: 'ali', password: 'secret' },
                fetchFn
            );
            expect(data.token).toBe('tok');
            expect(fetchFn).toHaveBeenCalledWith(
                'http://api/auth/login',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('register surfaces server error message', async () => {
            const fetchFn = vi.fn(async () => ({
                ok: false,
                json: async () => ({ error: 'username taken' }),
            }));
            await expect(
                Auth.register('http://api', { username: 'ali', password: 'secret' }, fetchFn)
            ).rejects.toThrow('username taken');
        });
    });
});
