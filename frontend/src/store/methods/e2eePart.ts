import {
  base64UrlToBytes,
  base64UrlToUtf8,
  bytesToBase64Url,
  utf8ToBase64Url,
} from "@/lib/codec";
import { API_URL } from "@/store/constants";
import type { ChatMessage } from "@/store/types";

type DeviceRow = {
  device_id: string;
  key_id: string;
  algorithm?: string;
  public_key: string;
  enc_private_key?: string;
  enc_private_key_iv?: string;
  kdf_salt?: string;
  kdf_iterations?: number;
};

export function e2eePart(
  set: (fn: (d: import("immer").Draft<Record<string, unknown>>) => void) => void,
  get: () => Record<string, unknown>
) {
  const api: Record<string, unknown> = {};

  api.resetE2EEState = () => {
    set((d) => {
      const draft = d as import("@/store/initialState").MessengerDataState;
      draft.e2ee.ready = false;
      draft.e2ee.ownerUserId = null;
      draft.e2ee.deviceId = "";
      draft.e2ee.keyId = "";
      draft.e2ee.privateJwk = null;
      draft.e2ee.publicJwk = null;
      draft.e2ee.recipientKeys = {};
      draft.e2ee.recipientKeyPromises = {};
      draft.e2ee.recipientKeyMeta = {};
      draft.e2ee.noKeyWarnedRecipients = {};
    });
  };

  api.getMyDeviceKeys = async (): Promise<DeviceRow[]> => {
    const s = get() as import("@/store/initialState").MessengerDataState;
    const res = await fetch(`${API_URL}/keys/devices/self`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.devices || [];
  };

  api.encryptPrivateKeyForBackup = async (privateJwk: JsonWebKey, password: string) => {
    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
    const derivedKey = await (api.derivePasswordKey as (a: string, b: Uint8Array, c: number) => Promise<CryptoKey>)(
      password,
      saltBytes,
      150000
    );
    const encoded = new TextEncoder().encode(JSON.stringify(privateJwk));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBytes },
      derivedKey,
      encoded
    );
    return {
      enc_private_key: bytesToBase64Url(new Uint8Array(encrypted)),
      enc_private_key_iv: bytesToBase64Url(ivBytes),
      kdf_salt: bytesToBase64Url(saltBytes),
      kdf_iterations: 150000,
      kdf_alg: "PBKDF2-SHA256",
      key_wrap_version: 1,
    };
  };

  api.decryptPrivateKeyBackup = async (device: DeviceRow, password: string) => {
    if (!device?.enc_private_key || !device?.enc_private_key_iv || !device?.kdf_salt || !device?.kdf_iterations) {
      throw new Error("missing backup fields");
    }
    const saltBytes = base64UrlToBytes(device.kdf_salt);
    const ivBytes = base64UrlToBytes(device.enc_private_key_iv);
    const derivedKey = await (api.derivePasswordKey as (a: string, b: Uint8Array, c: number) => Promise<CryptoKey>)(
      password,
      saltBytes,
      device.kdf_iterations
    );
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      derivedKey,
      base64UrlToBytes(device.enc_private_key)
    );
    const privateJwk = JSON.parse(new TextDecoder().decode(decrypted));
    return {
      privateJwk,
      publicJwk: JSON.parse(base64UrlToUtf8(device.public_key)),
    };
  };

  api.derivePasswordKey = async (password: string, saltBytes: Uint8Array, iterations: number) => {
    const enc = new TextEncoder().encode(password);
    const baseKey = await window.crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveKey"]);
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  api.getUserDeviceKeys = async (userId: number): Promise<DeviceRow[]> => {
    const TTL_POPULATED_MS = 30000;
    const TTL_EMPTY_MS = 3000;
    const st = get() as import("@/store/initialState").MessengerDataState;
    const meta = st.e2ee.recipientKeyMeta[userId];
    const cached = st.e2ee.recipientKeys[userId];
    if (cached && meta && Date.now() - meta.fetchedAt < meta.ttl) {
      return cached as DeviceRow[];
    }
    const pend = st.e2ee.recipientKeyPromises[userId];
    if (pend) return pend as Promise<DeviceRow[]>;

    const fetchPromise = (async () => {
      const s = get() as import("@/store/initialState").MessengerDataState;
      const res = await fetch(`${API_URL}/keys/users/${userId}/devices`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) throw new Error("failed to fetch device keys");
      const data = await res.json();
      const devices = (data.devices || []).filter(
        (d: DeviceRow) => (d.algorithm || "").toUpperCase() === "ECDH-P256" && !!d.public_key
      );
      set((draft) => {
        const d = draft as import("@/store/initialState").MessengerDataState;
        d.e2ee.recipientKeys[userId] = devices;
        d.e2ee.recipientKeyMeta[userId] = {
          fetchedAt: Date.now(),
          ttl: devices.length ? TTL_POPULATED_MS : TTL_EMPTY_MS,
        };
      });
      return devices;
    })();

    set((draft) => {
      const d = draft as import("@/store/initialState").MessengerDataState;
      d.e2ee.recipientKeyPromises[userId] = fetchPromise as never;
    });

    const done = await fetchPromise.finally(() => {
      set((draft) => {
        const d = draft as import("@/store/initialState").MessengerDataState;
        delete d.e2ee.recipientKeyPromises[userId];
      });
    });
    return done;
  };

  api.getRecipientDeviceKey = async (
    userId: number,
    opts: { keyId?: string | null; deviceId?: string | null } = {}
  ): Promise<DeviceRow | null> => {
    const devices = await (api.getUserDeviceKeys as (uid: number) => Promise<DeviceRow[]>)(userId);
    if (!devices.length) return null;
    const keyId = opts.keyId;
    const deviceId = opts.deviceId;
    if (keyId || deviceId) {
      const matched = devices.find(
        (d) => (!keyId || d.key_id === keyId) && (!deviceId || d.device_id === deviceId)
      );
      if (matched) return matched;
    }
    return devices[0] || null;
  };

  api.deriveAesKeyFromDevice = async (device: DeviceRow) => {
    const s = get() as import("@/store/initialState").MessengerDataState;
    const privateKey = await window.crypto.subtle.importKey(
      "jwk",
      s.e2ee.privateJwk!,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    const publicJwk = JSON.parse(base64UrlToUtf8(device.public_key));
    const recipientPublicKey = await window.crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    const bits = await window.crypto.subtle.deriveBits(
      { name: "ECDH", public: recipientPublicKey },
      privateKey,
      256
    );
    return window.crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  };

  api.encryptTextMessage = async (receiverId: number, plainText: string) => {
    try {
      const ready = await (api.ensureE2EEReady as () => Promise<boolean>)();
      if (!ready) return null;
      const device = await (api.getRecipientDeviceKey as (id: number) => Promise<DeviceRow | null>)(receiverId);
      if (!device) return null;
      const aesKey = await (api.deriveAesKeyFromDevice as (d: DeviceRow) => Promise<CryptoKey>)(device);
      const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(plainText);
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivBytes },
        aesKey,
        encoded
      );
      const st = get() as import("@/store/initialState").MessengerDataState;
      return {
        encrypted: true,
        e2ee_v: 1,
        alg: "AES-256-GCM",
        sender_device_id: st.e2ee.deviceId,
        key_id: st.e2ee.keyId,
        iv: bytesToBase64Url(ivBytes),
        ciphertext: bytesToBase64Url(new Uint8Array(encryptedBuffer)),
      };
    } catch (err) {
      console.warn("E2EE encryption failed, will send plaintext:", err);
      return null;
    }
  };

  api.maybeDecryptMessage = async (msg: ChatMessage): Promise<ChatMessage> => {
    if (!msg?.encrypted || !msg?.ciphertext || !msg?.iv) return msg;
    try {
      const s = get() as import("@/store/initialState").MessengerDataState;
      const isOutgoing = Number(msg.sender_id) === Number(s.userId);
      const peerId = isOutgoing ? Number(msg.receiver_id) : Number(msg.sender_id);
      const device = await (api.getRecipientDeviceKey as (a: number, b?: object) => Promise<DeviceRow | null>)(
        peerId,
        isOutgoing ? {} : { keyId: msg.key_id, deviceId: msg.sender_device_id }
      );
      if (!device) return { ...msg, content: "🔒 پیام رمزنگاری شده" };
      const aesKey = await (api.deriveAesKeyFromDevice as (d: DeviceRow) => Promise<CryptoKey>)(device);
      const plaintextBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlToBytes(msg.iv!) },
        aesKey,
        base64UrlToBytes(msg.ciphertext!)
      );
      const content = new TextDecoder().decode(plaintextBuffer);
      return { ...msg, content };
    } catch {
      return { ...msg, content: "🔒 پیام رمزنگاری شده (قابل خواندن نیست)" };
    }
  };

  api.decryptMessageList = async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    return Promise.all(messages.map((m) => (api.maybeDecryptMessage as (x: ChatMessage) => Promise<ChatMessage>)(m)));
  };

  api.ensureE2EEReady = async (): Promise<boolean> => {
    const s = get() as import("@/store/initialState").MessengerDataState;
    if (!s.e2ee.enabled || !window.crypto?.subtle || !s.token || !s.userId) return false;
    if (
      s.e2ee.ready &&
      s.e2ee.privateJwk &&
      s.e2ee.publicJwk &&
      Number(s.e2ee.ownerUserId) === Number(s.userId)
    )
      return true;

    if (Number(s.e2ee.ownerUserId) !== Number(s.userId)) {
      (api.resetE2EEState as () => void)();
    }

    const uid = (get() as import("@/store/initialState").MessengerDataState).userId!;
    const storagePrefix = `payambar:e2ee:${uid}`;
    const storedPrivate = localStorage.getItem(`${storagePrefix}:private_jwk`);
    const storedPublic = localStorage.getItem(`${storagePrefix}:public_jwk`);
    const storedDeviceId = localStorage.getItem(`${storagePrefix}:device_id`);
    const storedKeyId = localStorage.getItem(`${storagePrefix}:key_id`);

    const passwordForBackup = (get() as import("@/store/initialState").MessengerDataState).authPassword || "";
    let keysFromExistingSource = false;

    if (storedPrivate && storedPublic && storedDeviceId && storedKeyId) {
      set((d) => {
        const draft = d as import("@/store/initialState").MessengerDataState;
        draft.e2ee.privateJwk = JSON.parse(storedPrivate);
        draft.e2ee.publicJwk = JSON.parse(storedPublic);
        draft.e2ee.deviceId = storedDeviceId;
        draft.e2ee.keyId = storedKeyId;
        draft.e2ee.ownerUserId = uid;
      });
      keysFromExistingSource = true;
    } else if (passwordForBackup) {
      const myDevices = await (api.getMyDeviceKeys as () => Promise<DeviceRow[]>)();
      const backupDevice = (myDevices || []).find((x) => x.enc_private_key);
      if (backupDevice) {
        try {
          const pair = await (api.decryptPrivateKeyBackup as (d: DeviceRow, p: string) => Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }>)(
            backupDevice,
            passwordForBackup
          );
          set((d) => {
            const draft = d as import("@/store/initialState").MessengerDataState;
            draft.e2ee.privateJwk = pair.privateJwk;
            draft.e2ee.publicJwk = pair.publicJwk;
            draft.e2ee.deviceId = backupDevice.device_id;
            draft.e2ee.keyId = backupDevice.key_id;
            draft.e2ee.ownerUserId = uid;
          });
          keysFromExistingSource = true;
          localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(pair.privateJwk));
          localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(pair.publicJwk));
          localStorage.setItem(`${storagePrefix}:device_id`, backupDevice.device_id);
          localStorage.setItem(`${storagePrefix}:key_id`, backupDevice.key_id);
        } catch {
          alert(
            "بازیابی کلید امن با رمز عبور فعلی ممکن نیست. پیام‌های قدیمی ممکن است قابل خواندن نباشند."
          );
        }
      } else {
        if (!(get() as import("@/store/initialState").MessengerDataState).suppressBackupWarningOnce) {
          alert(
            "پشتیبان کلید امنی روی سرور پیدا نشد. کلید جدید ساخته می‌شود و پیام‌های رمزنگاری‌شده قبلی در این دستگاه قابل خواندن نیست."
          );
        }
      }
    }

    const st = get() as import("@/store/initialState").MessengerDataState;
    if (!st.e2ee.privateJwk || !st.e2ee.publicJwk) {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
      );
      const pk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const pub = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const did = window.crypto.randomUUID ? window.crypto.randomUUID() : `web-${Date.now()}`;
      const kid = `k-${Date.now()}`;
      localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(pk));
      localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(pub));
      localStorage.setItem(`${storagePrefix}:device_id`, did);
      localStorage.setItem(`${storagePrefix}:key_id`, kid);
      set((d) => {
        const draft = d as import("@/store/initialState").MessengerDataState;
        draft.e2ee.privateJwk = pk;
        draft.e2ee.publicJwk = pub;
        draft.e2ee.deviceId = did;
        draft.e2ee.keyId = kid;
        draft.e2ee.ownerUserId = st.userId;
      });
    }

    const cur = get() as import("@/store/initialState").MessengerDataState;
    let backupPayload: Record<string, unknown> = {};
    const pwd = cur.authPassword;
    if (pwd) {
      try {
        backupPayload = await (api.encryptPrivateKeyForBackup as (j: JsonWebKey, p: string) => Promise<Record<string, unknown>>)(
          cur.e2ee.privateJwk!,
          pwd
        );
      } catch {
        /* noop */
      }
    }

    try {
      const res = await fetch(`${API_URL}/keys/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cur.token}` },
        body: JSON.stringify({
          device_id: cur.e2ee.deviceId,
          algorithm: "ECDH-P256",
          public_key: utf8ToBase64Url(JSON.stringify(cur.e2ee.publicJwk)),
          key_id: cur.e2ee.keyId,
          ...backupPayload,
        }),
      });
      if (!res.ok) throw new Error("Device key publish failed");
    } catch {
      if (!keysFromExistingSource) {
        set((d) => {
          (d as import("@/store/initialState").MessengerDataState).authPassword = "";
        });
        return false;
      }
    }
    set((d) => {
      const draft = d as import("@/store/initialState").MessengerDataState;
      draft.e2ee.ready = true;
      draft.authPassword = "";
      draft.suppressBackupWarningOnce = false;
    });
    return true;
  };

  return api;
}
