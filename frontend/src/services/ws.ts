import { parseWebSocketMessage } from './funcs';

export const READY_CONNECTING = 0;
export const READY_OPEN = 1;

export function isTokenValid(token: string | null | undefined): boolean {
  return typeof token === 'string' && Boolean(token) && token !== 'undefined' && token !== 'null';
}

export function buildUrl(wsBaseUrl: string, token: string): string {
  return `${wsBaseUrl}?token=${encodeURIComponent(token)}`;
}

/**
 * Calculates exponential backoff reconnect delay.
 * @param attempt 1-based reconnect attempt count (after increment)
 */
export function reconnectDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
}

export function shouldReconnect({
  isAuthed,
  intentionalClose,
  attempts,
  maxAttempts,
}: {
  isAuthed: boolean;
  intentionalClose: boolean;
  attempts: number;
  maxAttempts: number;
}): boolean {
  if (intentionalClose || !isAuthed) return false;
  return attempts < maxAttempts;
}

export function canConnect({
  isAuthed,
  token,
  existingWs,
}: {
  isAuthed: boolean;
  token: string | null | undefined;
  existingWs?: WebSocket | null;
}): boolean {
  if (!isAuthed || !isTokenValid(token)) return false;
  if (
    existingWs &&
    (existingWs.readyState === READY_OPEN || existingWs.readyState === READY_CONNECTING)
  ) {
    return false;
  }
  return true;
}

export function parseIncoming<T = any>(eventData: string): T | null {
  return parseWebSocketMessage<T>(eventData);
}

export interface CreateConnectionOptions {
  WebSocketImpl?: typeof WebSocket;
  wsUrl: string;
  token: string;
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (err: Event) => void;
  onClose?: () => void;
}

/**
 * Creates a WebSocket connection and wires lifecycle callbacks.
 */
export function createConnection({
  WebSocketImpl,
  wsUrl,
  token,
  onOpen,
  onMessage,
  onError,
  onClose,
}: CreateConnectionOptions): WebSocket {
  const Impl = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!Impl) {
    throw new Error('WebSocket implementation not available');
  }

  const ws = new Impl(buildUrl(wsUrl, token));

  ws.onopen = () => {
    onOpen?.();
  };

  ws.onmessage = (event: MessageEvent) => {
    const data = parseIncoming(event.data);
    if (!data) {
      console.error('WebSocket parse error: invalid JSON');
      return;
    }
    onMessage?.(data);
  };

  ws.onerror = (err: Event) => {
    onError?.(err);
  };

  ws.onclose = () => {
    onClose?.();
  };

  return ws;
}
