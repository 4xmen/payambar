import { describe, it, expect, vi } from 'vitest';
import * as PayambarWs from '@/services/ws';

describe('PayambarWs', () => {
  describe('isTokenValid and buildUrl', () => {
    it('validates tokens', () => {
      expect(PayambarWs.isTokenValid('valid.jwt')).toBe(true);
      expect(PayambarWs.isTokenValid('')).toBe(false);
      expect(PayambarWs.isTokenValid(null)).toBe(false);
      expect(PayambarWs.isTokenValid('null')).toBe(false);
      expect(PayambarWs.isTokenValid('undefined')).toBe(false);
    });

    it('builds URL with encoded token query param', () => {
      expect(PayambarWs.buildUrl('ws://localhost:8080/ws', 'abc+123')).toBe(
        'ws://localhost:8080/ws?token=abc%2B123'
      );
    });
  });

  describe('reconnectDelay', () => {
    it('calculates exponential backoff capped by maxDelay', () => {
      expect(PayambarWs.reconnectDelay(1, 1000, 30000)).toBe(1000);
      expect(PayambarWs.reconnectDelay(2, 1000, 30000)).toBe(2000);
      expect(PayambarWs.reconnectDelay(3, 1000, 30000)).toBe(4000);
      expect(PayambarWs.reconnectDelay(10, 1000, 30000)).toBe(30000);
    });
  });

  describe('shouldReconnect and canConnect', () => {
    it('shouldReconnect returns false on intentional close or unauthed', () => {
      expect(
        PayambarWs.shouldReconnect({
          isAuthed: true,
          intentionalClose: true,
          attempts: 0,
          maxAttempts: 5,
        })
      ).toBe(false);

      expect(
        PayambarWs.shouldReconnect({
          isAuthed: false,
          intentionalClose: false,
          attempts: 0,
          maxAttempts: 5,
        })
      ).toBe(false);

      expect(
        PayambarWs.shouldReconnect({
          isAuthed: true,
          intentionalClose: false,
          attempts: 5,
          maxAttempts: 5,
        })
      ).toBe(false);

      expect(
        PayambarWs.shouldReconnect({
          isAuthed: true,
          intentionalClose: false,
          attempts: 1,
          maxAttempts: 5,
        })
      ).toBe(true);
    });

    it('canConnect returns false if already connected or invalid auth', () => {
      expect(PayambarWs.canConnect({ isAuthed: false, token: 'abc' })).toBe(false);
      expect(
        PayambarWs.canConnect({
          isAuthed: true,
          token: 'abc',
          existingWs: { readyState: PayambarWs.READY_OPEN } as any,
        })
      ).toBe(false);

      expect(
        PayambarWs.canConnect({
          isAuthed: true,
          token: 'abc',
          existingWs: null,
        })
      ).toBe(true);
    });
  });

  describe('createConnection', () => {
    it('builds socket and forwards parsed messages', () => {
      const handlers: Record<string, Function> = {};
      class MockWS {
        url: string;
        constructor(url: string) {
          this.url = url;
        }
        set onopen(fn: Function) {
          handlers.open = fn;
        }
        set onmessage(fn: Function) {
          handlers.message = fn;
        }
        set onerror(fn: Function) {
          handlers.error = fn;
        }
        set onclose(fn: Function) {
          handlers.close = fn;
        }
      }

      const onOpen = vi.fn();
      const onMessage = vi.fn();
      const onClose = vi.fn();

      PayambarWs.createConnection({
        WebSocketImpl: MockWS as any,
        wsUrl: 'ws://example.com/ws',
        token: 'token123',
        onOpen,
        onMessage,
        onClose,
      });

      expect(handlers.open).toBeDefined();
      handlers.open();
      expect(onOpen).toHaveBeenCalled();

      handlers.message({ data: JSON.stringify({ type: 'message', content: 'test' }) });
      expect(onMessage).toHaveBeenCalledWith({ type: 'message', content: 'test' });

      handlers.close();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
