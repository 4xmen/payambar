import type { SessionData } from '../types';
import { isValidAuth } from './funcs';

export const STORAGE_KEYS = {
  token: 'token',
  userId: 'userId',
  username: 'username',
  displayName: 'displayName',
} as const;

export function loadStoredSession(storage?: Storage): SessionData | null {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return null;

  const token = store.getItem(STORAGE_KEYS.token);
  const userId = store.getItem(STORAGE_KEYS.userId);
  const username = store.getItem(STORAGE_KEYS.username);
  const displayName = store.getItem(STORAGE_KEYS.displayName) || '';

  if (!isValidAuth(token, userId, username)) {
    return null;
  }

  return {
    token: token!,
    userId: parseInt(userId!, 10),
    username: username!,
    displayName,
  };
}

export function persistSession(
  storage: Storage | undefined,
  session: { token: string; userId: number | string; username: string; displayName?: string | null }
): void {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;

  store.setItem(STORAGE_KEYS.token, session.token);
  store.setItem(STORAGE_KEYS.userId, String(session.userId));
  store.setItem(STORAGE_KEYS.username, session.username);
  if (session.displayName !== undefined && session.displayName !== null) {
    store.setItem(STORAGE_KEYS.displayName, session.displayName);
  }
}

export function clearSession(storage?: Storage): void {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (store) {
    store.clear();
  }
}

export interface RegisterValidationParams {
  acceptRules: boolean;
  password?: string;
  confirm?: string;
}

export function validateRegister(
  params: RegisterValidationParams
): { ok: true } | { ok: false; error: string } {
  if (!params.acceptRules) {
    return { ok: false, error: 'لطفاً قوانین را بپذیرید.' };
  }
  if (!params.password || params.password !== params.confirm) {
    return { ok: false, error: 'رمز‌عبورها مطابقت ندارند' };
  }
  return { ok: true };
}

export async function postAuth<T = any>(
  apiUrl: string,
  path: string,
  body: Record<string, unknown>,
  fetchFn?: typeof fetch
): Promise<T> {
  const doFetch = fetchFn || fetch;
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
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export async function login(
  apiUrl: string,
  credentials: { username: string; password?: string },
  fetchFn?: typeof fetch
): Promise<{ token: string; user_id: number; username: string }> {
  return postAuth(apiUrl, '/auth/login', credentials, fetchFn);
}

export async function register(
  apiUrl: string,
  credentials: { username: string; password?: string },
  fetchFn?: typeof fetch
): Promise<{ token: string; user_id: number; username: string }> {
  return postAuth(apiUrl, '/auth/register', credentials, fetchFn);
}
