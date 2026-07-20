import { describe, it, expect, beforeAll, vi } from 'vitest';
import '../lib/funcs.js';
import '../lib/ws.js';

const Ws = globalThis.PayambarWs;

describe('PayambarWs', () => {
    beforeAll(() => {
        expect(Ws).toBeDefined();
    });

    describe('isTokenValid', () => {
        it('accepts real tokens only', () => {
            expect(Ws.isTokenValid('abc')).toBe(true);
            expect(Ws.isTokenValid('')).toBe(false);
            expect(Ws.isTokenValid('undefined')).toBe(false);
            expect(Ws.isTokenValid('null')).toBe(false);
            expect(Ws.isTokenValid(null)).toBe(false);
        });
    });

    describe('buildUrl', () => {
        it('appends encoded token query', () => {
            expect(Ws.buildUrl('ws://localhost/ws', 'a b')).toBe('ws://localhost/ws?token=a%20b');
        });
    });

    describe('reconnectDelay', () => {
        it('exponential backoff capped by max', () => {
            expect(Ws.reconnectDelay(1, 1000, 30000)).toBe(1000);
            expect(Ws.reconnectDelay(2, 1000, 30000)).toBe(2000);
            expect(Ws.reconnectDelay(3, 1000, 30000)).toBe(4000);
            expect(Ws.reconnectDelay(10, 1000, 30000)).toBe(30000);
        });
    });

    describe('shouldReconnect', () => {
        it('reconnects only when authed and under max attempts', () => {
            expect(
                Ws.shouldReconnect({
                    isAuthed: true,
                    intentionalClose: false,
                    attempts: 0,
                    maxAttempts: 5,
                })
            ).toBe(true);
            expect(
                Ws.shouldReconnect({
                    isAuthed: true,
                    intentionalClose: true,
                    attempts: 0,
                    maxAttempts: 5,
                })
            ).toBe(false);
            expect(
                Ws.shouldReconnect({
                    isAuthed: false,
                    intentionalClose: false,
                    attempts: 0,
                    maxAttempts: 5,
                })
            ).toBe(false);
            expect(
                Ws.shouldReconnect({
                    isAuthed: true,
                    intentionalClose: false,
                    attempts: 5,
                    maxAttempts: 5,
                })
            ).toBe(false);
        });
    });

    describe('canConnect', () => {
        it('blocks invalid auth or busy sockets', () => {
            expect(Ws.canConnect({ isAuthed: false, token: 't', existingWs: null })).toBe(false);
            expect(Ws.canConnect({ isAuthed: true, token: 'undefined', existingWs: null })).toBe(false);
            expect(Ws.canConnect({ isAuthed: true, token: 'ok', existingWs: null })).toBe(true);
            expect(
                Ws.canConnect({
                    isAuthed: true,
                    token: 'ok',
                    existingWs: { readyState: Ws.READY_OPEN },
                })
            ).toBe(false);
            expect(
                Ws.canConnect({
                    isAuthed: true,
                    token: 'ok',
                    existingWs: { readyState: Ws.READY_CONNECTING },
                })
            ).toBe(false);
        });
    });

    describe('createConnection', () => {
        it('builds socket and forwards parsed messages', () => {
            const handlers = {};
            class FakeWebSocket {
                constructor(url) {
                    this.url = url;
                    this.readyState = Ws.READY_CONNECTING;
                }
                set onopen(fn) {
                    handlers.open = fn;
                }
                set onmessage(fn) {
                    handlers.message = fn;
                }
                set onerror(fn) {
                    handlers.error = fn;
                }
                set onclose(fn) {
                    handlers.close = fn;
                }
            }

            const onMessage = vi.fn();
            const ws = Ws.createConnection({
                WebSocketImpl: FakeWebSocket,
                wsUrl: 'ws://test/ws',
                token: 'tok',
                onMessage,
            });

            expect(ws.url).toBe('ws://test/ws?token=tok');
            handlers.message({ data: '{"type":"ping"}' });
            expect(onMessage).toHaveBeenCalledWith({ type: 'ping' });
            handlers.message({ data: 'not-json' });
            expect(onMessage).toHaveBeenCalledTimes(1);
        });
    });
});
