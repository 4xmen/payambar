import { describe, it, expect } from 'vitest';
import * as PayambarE2EE from '@/services/e2ee';

describe('PayambarE2EE', () => {
  it('encodes and decodes base64url', () => {
    const raw = 'سلام دنیا hello world 123!@#';
    const b64 = PayambarE2EE.utf8ToBase64Url(raw);
    expect(typeof b64).toBe('string');
    expect(b64).not.toContain('+');
    expect(b64).not.toContain('/');
    expect(b64).not.toContain('=');

    const decoded = PayambarE2EE.base64UrlToUtf8(b64);
    expect(decoded).toBe(raw);
  });

  it('encrypts and decrypts private key backup using password', async () => {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const backup = await PayambarE2EE.encryptPrivateKeyForBackup(privateJwk, 'my-secure-password');
    expect(backup.enc_private_key).toBeDefined();
    expect(backup.enc_private_key_iv).toBeDefined();
    expect(backup.kdf_salt).toBeDefined();
    expect(backup.kdf_iterations).toBe(150000);

    const device = {
      ...backup,
      public_key: PayambarE2EE.utf8ToBase64Url(JSON.stringify(publicJwk)),
    };

    const restored = await PayambarE2EE.decryptPrivateKeyBackup(device, 'my-secure-password');
    expect(restored.privateJwk.kty).toBe('EC');
    expect(restored.privateJwk.crv).toBe('P-256');
    expect(restored.publicJwk.x).toBe(publicJwk.x);
    expect(restored.publicJwk.y).toBe(publicJwk.y);
  });

  it('fails to decrypt key backup with wrong password', async () => {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const backup = await PayambarE2EE.encryptPrivateKeyForBackup(privateJwk, 'correct-password');

    const device = {
      ...backup,
      public_key: PayambarE2EE.utf8ToBase64Url(JSON.stringify(publicJwk)),
    };

    await expect(
      PayambarE2EE.decryptPrivateKeyBackup(device, 'wrong-password')
    ).rejects.toThrow();
  });

  it('encrypts and decrypts 1-on-1 text message between Alice and Bob', async () => {
    // Generate Alice key pair
    const alicePair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const alicePriv = await window.crypto.subtle.exportKey('jwk', alicePair.privateKey);
    const alicePub = await window.crypto.subtle.exportKey('jwk', alicePair.publicKey);

    // Generate Bob key pair
    const bobPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const bobPriv = await window.crypto.subtle.exportKey('jwk', bobPair.privateKey);
    const bobPub = await window.crypto.subtle.exportKey('jwk', bobPair.publicKey);

    const bobDevice = {
      device_id: 'bob-device-1',
      key_id: 'bob-key-1',
      public_key: PayambarE2EE.utf8ToBase64Url(JSON.stringify(bobPub)),
    };

    const aliceDevice = {
      device_id: 'alice-device-1',
      key_id: 'alice-key-1',
      public_key: PayambarE2EE.utf8ToBase64Url(JSON.stringify(alicePub)),
    };

    const secretText = 'پیام کاملا محرمانه و رمزنگاری شده!';

    // Alice encrypts for Bob
    const encryptedPayload = await PayambarE2EE.encryptTextWithDevice(
      alicePriv,
      'alice-device-1',
      'alice-key-1',
      bobDevice,
      secretText
    );

    expect(encryptedPayload.encrypted).toBe(true);
    expect(encryptedPayload.ciphertext).toBeDefined();
    expect(encryptedPayload.iv).toBeDefined();

    // Bob decrypts from Alice
    const decrypted = await PayambarE2EE.decryptTextWithDevice(
      bobPriv,
      aliceDevice,
      encryptedPayload.iv,
      encryptedPayload.ciphertext
    );

    expect(decrypted).toBe(secretText);
  });
});
