import { reactive } from 'vue';
import type { DeviceKey, E2EEState, Message } from '../types';
import { API_URL, authHeaders } from '../services/api';
import {
  decryptPrivateKeyBackup,
  decryptTextWithDevice,
  encryptPrivateKeyForBackup,
  encryptTextWithDevice,
  utf8ToBase64Url,
} from '../services/e2ee';

const TTL_POPULATED_MS = 30000;
const TTL_EMPTY_MS = 3000;

const e2ee = reactive<E2EEState>({
  enabled: true,
  ready: false,
  ownerUserId: null,
  deviceId: '',
  keyId: '',
  privateJwk: null,
  publicJwk: null,
  recipientKeys: {},
  recipientKeyPromises: {},
  recipientKeyMeta: {},
  noKeyWarnedRecipients: {},
});

export function useE2EE() {
  function resetE2EEState() {
    e2ee.ready = false;
    e2ee.ownerUserId = null;
    e2ee.deviceId = '';
    e2ee.keyId = '';
    e2ee.privateJwk = null;
    e2ee.publicJwk = null;
    e2ee.recipientKeys = {};
    e2ee.recipientKeyPromises = {};
    e2ee.recipientKeyMeta = {};
    e2ee.noKeyWarnedRecipients = {};
  }

  async function getMyDeviceKeys(token: string): Promise<DeviceKey[]> {
    try {
      const res = await fetch(`${API_URL}/keys/devices/self`, {
        headers: authHeaders(token),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.devices || [];
    } catch {
      return [];
    }
  }

  async function getUserDeviceKeys(
    token: string,
    userId: number,
    forceRefresh = false
  ): Promise<DeviceKey[]> {
    const meta = e2ee.recipientKeyMeta[userId];
    if (!forceRefresh && e2ee.recipientKeys[userId] && meta && Date.now() - meta.fetchedAt < meta.ttl) {
      return e2ee.recipientKeys[userId];
    }
    const existingPromise = e2ee.recipientKeyPromises[userId];
    if (!forceRefresh && existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      const res = await fetch(`${API_URL}/keys/users/${userId}/devices`, {
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error('failed to fetch device keys');
      const data = await res.json();
      const devices = (data.devices || []).filter(
        (d: any) => (d.algorithm || '').toUpperCase() === 'ECDH-P256' && Boolean(d.public_key)
      );
      e2ee.recipientKeys[userId] = devices;
      e2ee.recipientKeyMeta[userId] = {
        fetchedAt: Date.now(),
        ttl: devices.length ? TTL_POPULATED_MS : TTL_EMPTY_MS,
      };
      return devices;
    })();

    e2ee.recipientKeyPromises[userId] = fetchPromise.finally(() => {
      delete e2ee.recipientKeyPromises[userId];
    });

    return fetchPromise;
  }

  async function getRecipientDeviceKey(
    token: string,
    userId: number,
    options?: { keyId?: string | null; deviceId?: string | null }
  ): Promise<DeviceKey | null> {
    let devices = await getUserDeviceKeys(token, userId);
    if (!devices.length) return null;

    if (options?.keyId || options?.deviceId) {
      let matched = devices.find(
        (d) =>
          (!options.keyId || d.key_id === options.keyId) &&
          (!options.deviceId || d.device_id === options.deviceId)
      );
      if (matched) return matched;

      // Force refresh if specific keyId was not in cache
      devices = await getUserDeviceKeys(token, userId, true);
      matched = devices.find(
        (d) =>
          (!options.keyId || d.key_id === options.keyId) &&
          (!options.deviceId || d.device_id === options.deviceId)
      );
      if (matched) return matched;
    }

    return devices[0] || null;
  }

  async function ensureE2EEReady(
    token: string | null,
    userId: number | null,
    authPassword = ''
  ): Promise<boolean> {
    if (!e2ee.enabled || typeof window === 'undefined' || !window.crypto?.subtle || !token || !userId) {
      return false;
    }

    if (
      e2ee.ready &&
      e2ee.privateJwk &&
      e2ee.publicJwk &&
      Number(e2ee.ownerUserId) === Number(userId)
    ) {
      return true;
    }

    if (Number(e2ee.ownerUserId) !== Number(userId)) {
      resetE2EEState();
    }

    const storagePrefix = `payambar:e2ee:${userId}`;
    const storedPrivate = localStorage.getItem(`${storagePrefix}:private_jwk`);
    const storedPublic = localStorage.getItem(`${storagePrefix}:public_jwk`);
    const storedDeviceId = localStorage.getItem(`${storagePrefix}:device_id`);
    const storedKeyId = localStorage.getItem(`${storagePrefix}:key_id`);

    let keysFromExistingSource = false;

    // Check if server has a backed-up key first if password is provided
    if (authPassword) {
      const myDevices = await getMyDeviceKeys(token);
      const backupDevice = (myDevices || []).find((d) => d.enc_private_key);
      if (backupDevice) {
        try {
          const { privateJwk, publicJwk } = await decryptPrivateKeyBackup(
            backupDevice,
            authPassword
          );
          e2ee.privateJwk = privateJwk;
          e2ee.publicJwk = publicJwk;
          e2ee.deviceId = backupDevice.device_id;
          e2ee.keyId = backupDevice.key_id;
          e2ee.ownerUserId = userId;
          keysFromExistingSource = true;
          localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(privateJwk));
          localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(publicJwk));
          localStorage.setItem(`${storagePrefix}:device_id`, backupDevice.device_id);
          localStorage.setItem(`${storagePrefix}:key_id`, backupDevice.key_id);
        } catch (err) {
          console.warn('Failed to decrypt backed up key', err);
        }
      }
    }

    // If not restored from backup, try local storage
    if (!e2ee.privateJwk && storedPrivate && storedPublic && storedDeviceId && storedKeyId) {
      e2ee.privateJwk = JSON.parse(storedPrivate);
      e2ee.publicJwk = JSON.parse(storedPublic);
      e2ee.deviceId = storedDeviceId;
      e2ee.keyId = storedKeyId;
      e2ee.ownerUserId = userId;
      keysFromExistingSource = true;
    }

    if (!e2ee.privateJwk || !e2ee.publicJwk) {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
      );
      const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const deviceId =
        typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : `web-${Date.now()}`;
      const keyId = `k-${Date.now()}`;

      localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(privateJwk));
      localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(publicJwk));
      localStorage.setItem(`${storagePrefix}:device_id`, deviceId);
      localStorage.setItem(`${storagePrefix}:key_id`, keyId);

      e2ee.privateJwk = privateJwk;
      e2ee.publicJwk = publicJwk;
      e2ee.deviceId = deviceId;
      e2ee.keyId = keyId;
      e2ee.ownerUserId = userId;
    }

    // Backup and publish device key
    let backupPayload: Record<string, unknown> = {};
    if (authPassword && e2ee.privateJwk) {
      try {
        backupPayload = await encryptPrivateKeyForBackup(e2ee.privateJwk, authPassword);
      } catch (err) {
        console.warn('Encrypt private key for backup failed', err);
      }
    }

    try {
      const res = await fetch(`${API_URL}/keys/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({
          device_id: e2ee.deviceId,
          algorithm: 'ECDH-P256',
          public_key: utf8ToBase64Url(JSON.stringify(e2ee.publicJwk)),
          key_id: e2ee.keyId,
          ...backupPayload,
        }),
      });
      if (!res.ok) throw new Error('Device key publish failed');
    } catch (err) {
      console.warn('Failed to publish device key:', err);
      if (!keysFromExistingSource) {
        return false;
      }
    }

    e2ee.ready = true;
    return true;
  }

  async function encryptTextMessage(
    token: string,
    receiverId: number,
    plainText: string
  ): Promise<any | null> {
    try {
      if (!e2ee.ready || !e2ee.privateJwk) return null;
      const device = await getRecipientDeviceKey(token, receiverId);
      if (!device) return null;
      return encryptTextWithDevice(
        e2ee.privateJwk,
        e2ee.deviceId,
        e2ee.keyId,
        device,
        plainText
      );
    } catch (err) {
      console.warn('E2EE encryption failed, will send plaintext:', err);
      return null;
    }
  }

  async function maybeDecryptMessage(
    token: string,
    myUserId: number,
    msg: Message
  ): Promise<Message> {
    if (!msg?.encrypted || !msg?.ciphertext || !msg?.iv) return msg;
    try {
      if (!e2ee.privateJwk && myUserId && typeof window !== 'undefined') {
        const storagePrefix = `e2ee:${myUserId}`;
        const storedPrivate = localStorage.getItem(`${storagePrefix}:private_jwk`);
        const storedPublic = localStorage.getItem(`${storagePrefix}:public_jwk`);
        const storedDeviceId = localStorage.getItem(`${storagePrefix}:device_id`);
        const storedKeyId = localStorage.getItem(`${storagePrefix}:key_id`);
        if (storedPrivate && storedPublic && storedDeviceId && storedKeyId) {
          try {
            e2ee.privateJwk = JSON.parse(storedPrivate);
            e2ee.publicJwk = JSON.parse(storedPublic);
            e2ee.deviceId = storedDeviceId;
            e2ee.keyId = storedKeyId;
            e2ee.ownerUserId = myUserId;
            e2ee.ready = true;
          } catch {}
        }
      }
      if (!e2ee.privateJwk) return { ...msg, content: '🔒 پیام رمزنگاری شده' };
      const isOutgoing = Number(msg.sender_id) === Number(myUserId);
      const peerId = isOutgoing ? Number(msg.receiver_id) : Number(msg.sender_id);
      const device = await getRecipientDeviceKey(
        token,
        peerId,
        isOutgoing ? {} : { keyId: msg.key_id, deviceId: msg.sender_device_id }
      );
      if (!device) return { ...msg, content: '🔒 پیام رمزنگاری شده' };
      const content = await decryptTextWithDevice(
        e2ee.privateJwk,
        device,
        msg.iv,
        msg.ciphertext
      );
      return { ...msg, content };
    } catch (err) {
      console.warn('Decrypt failed', err);
      return { ...msg, content: '🔒 پیام رمزنگاری شده (قابل خواندن نیست)' };
    }
  }

  async function decryptMessageList(
    token: string,
    myUserId: number,
    messages: Message[]
  ): Promise<Message[]> {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    return Promise.all(messages.map((m) => maybeDecryptMessage(token, myUserId, m)));
  }

  return {
    e2ee,
    resetE2EEState,
    ensureE2EEReady,
    encryptTextMessage,
    maybeDecryptMessage,
    decryptMessageList,
    getMyDeviceKeys,
    getUserDeviceKeys,
    getRecipientDeviceKey,
  };
}
