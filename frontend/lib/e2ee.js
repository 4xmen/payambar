/**
 * Payambar E2EE pure helpers extracted from app.js.
 *
 * Loaded as a classic script in the browser (sets globalThis.PayambarE2EE)
 * and imported as a side-effect module in Vitest (same global).
 *
 * Keep this free of Vue, fetch, and localStorage — orchestration stays in app.js.
 */
(function (global) {
    'use strict';

    function getCrypto() {
        const c = global.crypto;
        if (!c?.subtle) {
            throw new Error('Web Crypto API (crypto.subtle) is not available');
        }
        return c;
    }

    // --- Encoding helpers (from app.js) ---

    function utf8ToBase64Url(value) {
        const bytes = new TextEncoder().encode(value);
        return bytesToBase64Url(bytes);
    }

    function base64UrlToUtf8(value) {
        const bytes = base64UrlToBytes(value);
        return new TextDecoder().decode(bytes);
    }

    function bytesToBase64Url(bytes) {
        let binary = '';
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function base64UrlToBytes(value) {
        const base64 =
            value.replace(/-/g, '+').replace(/_/g, '/') +
            '==='.slice((value.length + 3) % 4);
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
        return out;
    }

    // --- Password-based key backup (from app.js) ---

    async function derivePasswordKey(password, saltBytes, iterations) {
        const crypto = getCrypto();
        const enc = new TextEncoder().encode(password);
        const baseKey = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations,
                hash: 'SHA-256',
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptPrivateKeyForBackup(privateJwk, password) {
        const crypto = getCrypto();
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const ivBytes = crypto.getRandomValues(new Uint8Array(12));
        const derivedKey = await derivePasswordKey(password, saltBytes, 150000);
        const encoded = new TextEncoder().encode(JSON.stringify(privateJwk));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBytes },
            derivedKey,
            encoded
        );
        return {
            enc_private_key: bytesToBase64Url(new Uint8Array(encrypted)),
            enc_private_key_iv: bytesToBase64Url(ivBytes),
            kdf_salt: bytesToBase64Url(saltBytes),
            kdf_iterations: 150000,
            kdf_alg: 'PBKDF2-SHA256',
            key_wrap_version: 1,
        };
    }

    async function decryptPrivateKeyBackup(device, password) {
        if (
            !device?.enc_private_key ||
            !device?.enc_private_key_iv ||
            !device?.kdf_salt ||
            !device?.kdf_iterations
        ) {
            throw new Error('missing backup fields');
        }
        const crypto = getCrypto();
        const saltBytes = base64UrlToBytes(device.kdf_salt);
        const ivBytes = base64UrlToBytes(device.enc_private_key_iv);
        const derivedKey = await derivePasswordKey(password, saltBytes, device.kdf_iterations);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            derivedKey,
            base64UrlToBytes(device.enc_private_key)
        );
        const privateJwk = JSON.parse(new TextDecoder().decode(decrypted));
        return {
            privateJwk,
            publicJwk: JSON.parse(base64UrlToUtf8(device.public_key)),
        };
    }

    // --- ECDH + AES-GCM (from app.js deriveAesKeyFromDevice / encrypt / decrypt) ---

    async function deriveAesKeyFromDevice(privateJwk, device) {
        const crypto = getCrypto();
        const privateKey = await crypto.subtle.importKey(
            'jwk',
            privateJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits']
        );
        const publicJwk = JSON.parse(base64UrlToUtf8(device.public_key));
        const recipientPublicKey = await crypto.subtle.importKey(
            'jwk',
            publicJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: recipientPublicKey },
            privateKey,
            256
        );
        return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, [
            'encrypt',
            'decrypt',
        ]);
    }

    /**
     * Pure core of app.js encryptTextMessage once recipient device + sender ids are known.
     */
    async function encryptTextWithDevice(privateJwk, deviceId, keyId, recipientDevice, plainText) {
        const crypto = getCrypto();
        const aesKey = await deriveAesKeyFromDevice(privateJwk, recipientDevice);
        const ivBytes = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plainText);
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBytes },
            aesKey,
            encoded
        );
        return {
            encrypted: true,
            e2ee_v: 1,
            alg: 'AES-256-GCM',
            sender_device_id: deviceId,
            key_id: keyId,
            iv: bytesToBase64Url(ivBytes),
            ciphertext: bytesToBase64Url(new Uint8Array(encryptedBuffer)),
        };
    }

    /**
     * Pure core of app.js maybeDecryptMessage AES-GCM decrypt step.
     */
    async function decryptTextWithDevice(privateJwk, device, iv, ciphertext) {
        const crypto = getCrypto();
        const aesKey = await deriveAesKeyFromDevice(privateJwk, device);
        const plaintextBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
            aesKey,
            base64UrlToBytes(ciphertext)
        );
        return new TextDecoder().decode(plaintextBuffer);
    }

    function hasEncryptedEnvelope(msg) {
        return !!(msg && msg.encrypted && msg.ciphertext && msg.iv && msg.e2ee_v);
    }

    const PayambarE2EE = {
        utf8ToBase64Url,
        base64UrlToUtf8,
        bytesToBase64Url,
        base64UrlToBytes,
        derivePasswordKey,
        encryptPrivateKeyForBackup,
        decryptPrivateKeyBackup,
        deriveAesKeyFromDevice,
        encryptTextWithDevice,
        decryptTextWithDevice,
        hasEncryptedEnvelope,
    };

    global.PayambarE2EE = PayambarE2EE;
})(typeof globalThis !== 'undefined' ? globalThis : window);
