import { describe, it, expect, beforeAll } from 'vitest';
import '../lib/e2ee.js';

const E2EE = globalThis.PayambarE2EE;

async function generateEcdhKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    );
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    return { privateJwk, publicJwk };
}

function deviceFromPublicJwk(publicJwk, overrides = {}) {
    return {
        device_id: overrides.device_id || 'web-peer',
        key_id: overrides.key_id || 'k-peer',
        algorithm: 'ECDH-P256',
        public_key: E2EE.utf8ToBase64Url(JSON.stringify(publicJwk)),
        ...overrides,
    };
}

describe('PayambarE2EE encoding', () => {
    beforeAll(() => {
        expect(E2EE).toBeDefined();
    });

    it('utf8 ↔ base64url roundtrips', () => {
        const original = 'سلام Payambar 🔐';
        const encoded = E2EE.utf8ToBase64Url(original);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(E2EE.base64UrlToUtf8(encoded)).toBe(original);
    });

    it('bytes ↔ base64url roundtrips', () => {
        const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
        const encoded = E2EE.bytesToBase64Url(bytes);
        expect(Array.from(E2EE.base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
    });
});

describe('PayambarE2EE encrypt / decrypt', () => {
    it('Alice encrypts for Bob and Bob decrypts', async () => {
        const alice = await generateEcdhKeyPair();
        const bob = await generateEcdhKeyPair();
        const bobDevice = deviceFromPublicJwk(bob.publicJwk, {
            device_id: 'web-bob',
            key_id: 'k-bob',
        });

        const envelope = await E2EE.encryptTextWithDevice(
            alice.privateJwk,
            'web-alice',
            'k-alice',
            bobDevice,
            'پیام محرمانه'
        );

        expect(envelope).toMatchObject({
            encrypted: true,
            e2ee_v: 1,
            alg: 'AES-256-GCM',
            sender_device_id: 'web-alice',
            key_id: 'k-alice',
        });
        expect(envelope.iv).toBeTruthy();
        expect(envelope.ciphertext).toBeTruthy();
        expect(E2EE.hasEncryptedEnvelope(envelope)).toBe(true);

        const aliceDevice = deviceFromPublicJwk(alice.publicJwk, {
            device_id: 'web-alice',
            key_id: 'k-alice',
        });
        const plaintext = await E2EE.decryptTextWithDevice(
            bob.privateJwk,
            aliceDevice,
            envelope.iv,
            envelope.ciphertext
        );
        expect(plaintext).toBe('پیام محرمانه');
    });

    it('Bob can encrypt for Alice (reverse direction)', async () => {
        const alice = await generateEcdhKeyPair();
        const bob = await generateEcdhKeyPair();
        const aliceDevice = deviceFromPublicJwk(alice.publicJwk);

        const envelope = await E2EE.encryptTextWithDevice(
            bob.privateJwk,
            'web-bob',
            'k-bob',
            aliceDevice,
            'hello reverse'
        );
        const bobDevice = deviceFromPublicJwk(bob.publicJwk);
        const plaintext = await E2EE.decryptTextWithDevice(
            alice.privateJwk,
            bobDevice,
            envelope.iv,
            envelope.ciphertext
        );
        expect(plaintext).toBe('hello reverse');
    });

    it('wrong recipient key fails decrypt', async () => {
        const alice = await generateEcdhKeyPair();
        const bob = await generateEcdhKeyPair();
        const eve = await generateEcdhKeyPair();
        const bobDevice = deviceFromPublicJwk(bob.publicJwk);

        const envelope = await E2EE.encryptTextWithDevice(
            alice.privateJwk,
            'web-alice',
            'k-alice',
            bobDevice,
            'secret'
        );
        const aliceDevice = deviceFromPublicJwk(alice.publicJwk);

        await expect(
            E2EE.decryptTextWithDevice(eve.privateJwk, aliceDevice, envelope.iv, envelope.ciphertext)
        ).rejects.toThrow();
    });
});

describe('PayambarE2EE key backup', () => {
    it('encryptPrivateKeyForBackup → decryptPrivateKeyBackup roundtrip', async () => {
        const pair = await generateEcdhKeyPair();
        const password = 'strong-password-123';
        const backup = await E2EE.encryptPrivateKeyForBackup(pair.privateJwk, password);

        expect(backup).toMatchObject({
            kdf_iterations: 150000,
            kdf_alg: 'PBKDF2-SHA256',
            key_wrap_version: 1,
        });
        expect(backup.enc_private_key).toBeTruthy();
        expect(backup.enc_private_key_iv).toBeTruthy();
        expect(backup.kdf_salt).toBeTruthy();

        const device = {
            ...backup,
            public_key: E2EE.utf8ToBase64Url(JSON.stringify(pair.publicJwk)),
        };
        const restored = await E2EE.decryptPrivateKeyBackup(device, password);
        expect(restored.privateJwk).toEqual(pair.privateJwk);
        expect(restored.publicJwk).toEqual(pair.publicJwk);
    });

    it('wrong password fails backup decrypt', async () => {
        const pair = await generateEcdhKeyPair();
        const backup = await E2EE.encryptPrivateKeyForBackup(pair.privateJwk, 'correct');
        const device = {
            ...backup,
            public_key: E2EE.utf8ToBase64Url(JSON.stringify(pair.publicJwk)),
        };
        await expect(E2EE.decryptPrivateKeyBackup(device, 'wrong')).rejects.toThrow();
    });

    it('missing backup fields throws', async () => {
        await expect(E2EE.decryptPrivateKeyBackup({}, 'pw')).rejects.toThrow('missing backup fields');
    });
});

describe('PayambarE2EE hasEncryptedEnvelope', () => {
    it('detects valid envelope', () => {
        expect(
            E2EE.hasEncryptedEnvelope({
                encrypted: true,
                ciphertext: 'abc',
                iv: 'def',
                e2ee_v: 1,
            })
        ).toBe(true);
    });

    it('rejects incomplete envelope', () => {
        expect(E2EE.hasEncryptedEnvelope({ encrypted: true, ciphertext: 'abc' })).toBe(false);
        expect(E2EE.hasEncryptedEnvelope(null)).toBe(false);
        expect(E2EE.hasEncryptedEnvelope({ content: 'plain' })).toBe(false);
    });
});
