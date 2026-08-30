import { describe, it, expect, vi } from 'vitest';
import * as PayambarAuth from '@/services/auth';

describe('PayambarAuth', () => {
  function createMockStorage(seed: Record<string, string> = {}): Storage {
    const data = { ...seed };
    return {
      getItem: vi.fn((k: string) => (k in data ? data[k] : null)),
      setItem: vi.fn((k: string, v: string) => {
        data[k] = String(v);
      }),
      removeItem: vi.fn((k: string) => {
        delete data[k];
      }),
      clear: vi.fn(() => {
        for (const k of Object.keys(data)) delete data[k];
      }),
      key: vi.fn((i: number) => Object.keys(data)[i] || null),
      get length() {
        return Object.keys(data).length;
      },
    } as unknown as Storage;
  }

  describe('loadStoredSession', () => {
    it('returns session when all valid fields are present in storage', () => {
      const storage = createMockStorage({
        token: 'token.123',
        userId: '42',
        username: 'alice',
        displayName: 'Alice A.',
      });

      const session = PayambarAuth.loadStoredSession(storage);
      expect(session).toEqual({
        token: 'token.123',
        userId: 42,
        username: 'alice',
        displayName: 'Alice A.',
      });
    });

    it('returns null when required fields are missing or invalid', () => {
      const storage = createMockStorage({
        token: 'token.123',
        userId: '0',
        username: 'alice',
      });
      expect(PayambarAuth.loadStoredSession(storage)).toBeNull();
    });
  });

  describe('persistSession', () => {
    it('writes token, userId, username, displayName to storage', () => {
      const storage = createMockStorage();
      PayambarAuth.persistSession(storage, {
        token: 'tok',
        userId: 10,
        username: 'bob',
        displayName: 'Robert',
      });

      expect(storage.setItem).toHaveBeenCalledWith('token', 'tok');
      expect(storage.setItem).toHaveBeenCalledWith('userId', '10');
      expect(storage.setItem).toHaveBeenCalledWith('username', 'bob');
      expect(storage.setItem).toHaveBeenCalledWith('displayName', 'Robert');
    });
  });

  describe('clearSession', () => {
    it('calls storage.clear()', () => {
      const storage = createMockStorage({ token: 'abc' });
      PayambarAuth.clearSession(storage);
      expect(storage.clear).toHaveBeenCalled();
    });
  });

  describe('validateRegister', () => {
    it('fails when rules are not accepted', () => {
      const res = PayambarAuth.validateRegister({
        acceptRules: false,
        password: 'pass',
        confirm: 'pass',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('لطفاً قوانین را بپذیرید.');
      }
    });

    it('fails when passwords do not match', () => {
      const res = PayambarAuth.validateRegister({
        acceptRules: true,
        password: 'pass1',
        confirm: 'pass2',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('رمز‌عبورها مطابقت ندارند');
      }
    });

    it('succeeds for valid inputs', () => {
      const res = PayambarAuth.validateRegister({
        acceptRules: true,
        password: 'pass',
        confirm: 'pass',
      });
      expect(res.ok).toBe(true);
    });
  });

  describe('login and register network calls', () => {
    it('login calls postAuth with credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 't', user_id: 1, username: 'u' }),
      } as Response);

      const res = await PayambarAuth.login(
        'http://localhost:8080/api',
        { username: 'u', password: 'p' },
        mockFetch
      );
      expect(res).toEqual({ token: 't', user_id: 1, username: 'u' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/login',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('register calls postAuth with credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 't', user_id: 2, username: 'u2' }),
      } as Response);

      const res = await PayambarAuth.register(
        'http://localhost:8080/api',
        { username: 'u2', password: 'p' },
        mockFetch
      );
      expect(res).toEqual({ token: 't', user_id: 2, username: 'u2' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/register',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
