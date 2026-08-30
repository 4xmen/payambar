import type { DeviceKey, E2EEEncryptedPayload } from '../types';

export function getCrypto(): Crypto {
  const c = typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' ? window.crypto : null);
  if (!c?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available');
  }
  return c;
}

// --- Encoding helpers ---

export function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64Url(bytes);
}

export function base64UrlToUtf8(value: string): string {
  const bytes = base64UrlToBytes(value);
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// --- Password-based key backup ---

export async function derivePasswordKey(
  password: string,
  saltBytes: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const enc = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey('raw', enc as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKeyForBackup(
  privateJwk: JsonWebKey,
  password: string
): Promise<{
  enc_private_key: string;
  enc_private_key_iv: string;
  kdf_salt: string;
  kdf_iterations: number;
  kdf_alg: string;
  key_wrap_version: number;
}> {
  const crypto = getCrypto();
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = await derivePasswordKey(password, saltBytes, 150000);
  const encoded = new TextEncoder().encode(JSON.stringify(privateJwk));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    derivedKey,
    encoded as BufferSource
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

export async function decryptPrivateKeyBackup(
  device: Partial<DeviceKey>,
  password: string
): Promise<{
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
}> {
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
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    derivedKey,
    base64UrlToBytes(device.enc_private_key) as BufferSource
  );
  const privateJwk = JSON.parse(new TextDecoder().decode(decrypted)) as JsonWebKey;
  return {
    privateJwk,
    publicJwk: JSON.parse(base64UrlToUtf8(device.public_key || '')) as JsonWebKey,
  };
}

// --- ECDH + AES-GCM ---

export async function deriveAesKeyFromDevice(
  privateJwk: JsonWebKey,
  device: Partial<DeviceKey>
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const publicJwk = JSON.parse(base64UrlToUtf8(device.public_key || ''));
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
  return crypto.subtle.importKey('raw', bits as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptTextWithDevice(
  privateJwk: JsonWebKey,
  deviceId: string,
  keyId: string,
  recipientDevice: Partial<DeviceKey>,
  plainText: string
): Promise<E2EEEncryptedPayload> {
  const crypto = getCrypto();
  const aesKey = await deriveAesKeyFromDevice(privateJwk, recipientDevice);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    aesKey,
    encoded as BufferSource
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

export async function decryptTextWithDevice(
  privateJwk: JsonWebKey,
  device: Partial<DeviceKey>,
  iv: string,
  ciphertext: string
): Promise<string> {
  const crypto = getCrypto();
  const aesKey = await deriveAesKeyFromDevice(privateJwk, device);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) as BufferSource },
    aesKey,
    base64UrlToBytes(ciphertext) as BufferSource
  );
  return new TextDecoder().decode(plaintextBuffer);
}

export function hasEncryptedEnvelope(msg: any): boolean {
  return Boolean(msg && msg.encrypted && msg.ciphertext && msg.iv && msg.e2ee_v);
}
