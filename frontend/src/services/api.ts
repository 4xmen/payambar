const isBrowser = typeof window !== 'undefined';
const origin = isBrowser ? window.location.origin : 'http://localhost:8080';

export const API_URL = (isBrowser && window.API_URL) || `${origin}/api`;
export const WS_URL = (isBrowser && window.WS_URL) || `${origin.replace(/^http/, 'ws')}/ws`;

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

export function handleUnauthorized(): void {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
}
