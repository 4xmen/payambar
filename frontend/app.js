const API_URL = (typeof window !== 'undefined' && window.API_URL)
    ? window.API_URL
    : (window.location.origin + '/api');

const WS_URL = (typeof window !== 'undefined' && window.WS_URL)
    ? window.WS_URL
    : (window.location.origin.replace(/^http/, 'ws') + '/ws');

const { createApp } = Vue;
const NEW_CHAT_SEARCH_DEBOUNCE_MS = 500;

const UserSearchItem = {
    props: {
        user: {
            type: Object,
            required: true,
        },
    },
    emits: ['select'],
    computed: {
        normalizedUser() {
            return PayambarFuncs.normalizeSearchUser(this.user);
        },
    },
    methods: {
        selectUser() {
            this.$emit('select', this.normalizedUser);
        },
    },
    template: `
        <div class="user-item" @click="selectUser">
            <div class="user-avatar-wrapper">
                <img v-if="normalizedUser.avatarUrl" :src="normalizedUser.avatarUrl" class="user-avatar" alt="avatar">
                <span v-else class="user-avatar-placeholder">{{ normalizedUser.nameLabel.charAt(0).toUpperCase() }}</span>
                <span v-if="normalizedUser.isOnline" class="online-indicator"></span>
            </div>
            <div class="user-info">
                <div class="user-display-name">{{ normalizedUser.nameLabel }}</div>
                <div class="user-username">
                    @{{ normalizedUser.username }}
                    <span v-if="normalizedUser.isOnline" class="online-text"> آنلاین</span>
                </div>
            </div>
            <span class="chevron">›</span>
        </div>
    `,
};

const app = createApp({
    data() {
        return {
            token: null,
            userId: null,
            username: null,
            conversations: [],
            messages: {},
            currentConversationId: null,
            currentConversationUsername: '',
            currentConversationDisplayName: '',
            currentConversationAvatarUrl: null,
            currentConversationIsOnline: false,
            messageText: '',
            searchQuery: '',
            ws: null,
            wsReconnectAttempts: 0,
            wsMaxReconnectAttempts: 50,
            wsReconnectBaseDelay: 1000,
            wsReconnectMaxDelay: 30000,
            wsReconnectTimer: null,
            wsIntentionalClose: false,
            wsConnected: false,
            authTab: 'login',
            login: { username: '', password: '' },
            register: { username: '', password: '', confirm: '' },
            authPassword: '',
            suppressBackupWarningOnce: false,
            showRulesModal: false,
            acceptRules: false,
            authError: '',
            chatListOpen: true,
            loadingMessages: false,
            loadingOlderMessages: false,
            loadingConversations: false,
            hasMoreMessages: {},
            uploadingFile: false,
            recordingVoice: false,
            recordingElapsedSec: 0,
            recordingTimer: null,
            recordingStream: null,
            mediaRecorder: null,
            recordedChunks: [],
            sendingVoice: false,
            showNewChatModal: false,
            newChatSearchQuery: '',
            newChatSearchResults: [],
            newChatSearchLoading: false,
            newChatSearchError: '',
            newChatSearchTimeout: null,
            // showProfileModal removed in favor of native dialog
            activeProfileTab: 'profile',
            profileDisplayName: '',
            myAvatarUrl: null,
            uploadingAvatar: false,
            deleteAccountConfirm: '',
            deletingAccount: false,
            // Context menu state
            contextMenu: {
                show: false,
                x: 0,
                y: 0,
                message: null,
            },
            conversationMenu: {
                show: false,
                x: 0,
                y: 0,
                conversation: null,
            },
            // Offline state
            isOffline: !navigator.onLine,
            serverOffline: false,
            // Push notification state
            pushNotificationsEnabled: false,
            // Pull to refresh state
            pullToRefresh: {
                startY: 0,
                currentY: 0,
                pulling: false,
                refreshing: false,
                threshold: 80,
                ready: false,
            },
            // WebRTC Call state
            iceServers: [],
            localStream: null,
            remoteStream: null,
            peerConnection: null,
            pendingIceCandidates: [], // queued until remote description is set
            incomingCall: null, // { sender_id, username, displayName, avatar_url, offer }
            outgoingCall: null, // { receiver_id, username, displayName, avatar_url, status }
            activeCall: null,   // { user_id, username, displayName, avatar_url }
            pendingAutoAnswer: false,
            callDuration: '',
            callTimer: null,
            callStartTime: null,
            audioEnabled: true,
            wakeLockSentinel: null,
            e2ee: {
                enabled: true,
                ready: false,
                ownerUserId: null,
                deviceId: '',
                keyId: '',
                privateJwk: null,
                publicJwk: null,
                recipientKeys: {},
                recipientKeyPromises: {},
                recipientKeyMeta: {}, // { [userId]: { fetchedAt: number } }
                noKeyWarnedRecipients: {},
            },
            appVersion: '',
        };
    },
    computed: {
        isAuthed() {
            return !!this.token && !!this.userId && this.userId > 0;
        },
        userProfileStatusText() {
            if (!this.isAuthed) return '';
            if (this.wsConnected) {
                return 'آنلاین';
            }
            if (this.isOffline) {
                return 'آفلاین';
            }
            if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
                return 'آفلاین';
            }
            return 'در حال اتصال...';
        },
        filteredConversations() {
            return PayambarFuncs.filterConversations(
                this.getSortedConversations(),
                this.searchQuery
            );
        },
        messagesForCurrent() {
            return this.messages[this.currentConversationId] || [];
        },
    },
    mounted() {
        console.log('Vue app mounted');
        this.fetchAppVersion();
        this.initAuth();
        console.log('Auth state:', { token: !!this.token, userId: this.userId, isAuthed: this.isAuthed });
        if (this.isAuthed) {
            this.loadConversations();
            this.loadMyProfile();
            this.ensureE2EEReady().catch((err) => console.warn('E2EE init skipped:', err));
            this.connectWebSocket();
            this.fetchWebRTCConfig();
            this.restorePushSubscription();
        }

        // Listen for service worker messages (e.g. auto_answer from notification action)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'auto_answer') {
                    this.pendingAutoAnswer = true;
                    if (this.incomingCall) {
                        this.pendingAutoAnswer = false;
                        this.$nextTick(() => { this.acceptCall(); });
                    }
                }
            });
        }
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOffline = false;
            this.serverOffline = false;
            if (this.isAuthed) {
                this.loadConversations();
                if (this.currentConversationId) {
                    this.refreshCurrentConversation();
                }
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    this.wsReconnectAttempts = 0;
                    this.connectWebSocket();
                }
            }
        });
        window.addEventListener('offline', () => { this.isOffline = true; });

        // Reconnect WebSocket and re-acquire wake lock when tab becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (this.activeCall || this.outgoingCall) {
                    this.acquireWakeLock();
                }
                if (this.isAuthed) {
                    this.syncAfterResume();
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                        this.wsReconnectAttempts = 0;
                        this.serverOffline = false;
                        this.connectWebSocket();
                    }
                }
            }
        });
    },
    beforeUnmount() {
        this.cleanupVoiceRecorder();
    },
    methods: {
        openProfileModal() {
            const dialog = this.$refs.profileModal;
            if (dialog) {
                dialog.showModal();
            }
        },
        closeProfileModal() {
            const dialog = this.$refs.profileModal;
            if (dialog) {
                dialog.close();
            }
        },
        handleProfileBackdropClick(e) {
            const dialog = this.$refs.profileModal;
            if (dialog && e.target === dialog) {
                this.closeProfileModal();
            }
        },
        async fetchAppVersion() {
            try {
                const res = await fetch(`${API_URL}/version`);
                if (res.ok) {
                    const data = await res.json();
                    this.appVersion = data.version || '';
                }
            } catch (e) {
                console.warn('Failed to fetch app version:', e);
            }
        },
        initAuth() {
            const session = PayambarAuth.loadStoredSession(localStorage);
            console.log('initAuth - localStorage:', {
                storedToken: session?.token,
                storedUserId: session?.userId,
                storedUsername: session?.username,
            });

            if (session) {
                this.token = session.token;
                this.userId = session.userId;
                this.username = session.username;
                this.profileDisplayName = session.displayName || '';
                console.log('Auth restored from localStorage');
            } else {
                PayambarAuth.clearSession(localStorage);
                console.log('localStorage cleared - no valid auth data');
            }
        },

        utf8ToBase64Url(value) {
            return PayambarE2EE.utf8ToBase64Url(value);
        },
        base64UrlToUtf8(value) {
            return PayambarE2EE.base64UrlToUtf8(value);
        },
        bytesToBase64Url(bytes) {
            return PayambarE2EE.bytesToBase64Url(bytes);
        },
        base64UrlToBytes(value) {
            return PayambarE2EE.base64UrlToBytes(value);
        },
        async ensureE2EEReady() {
            if (!this.e2ee.enabled || !window.crypto?.subtle || !this.token || !this.userId) return false;
            if (
                this.e2ee.ready &&
                this.e2ee.privateJwk &&
                this.e2ee.publicJwk &&
                Number(this.e2ee.ownerUserId) === Number(this.userId)
            ) return true;

            if (Number(this.e2ee.ownerUserId) !== Number(this.userId)) {
                this.resetE2EEState();
            }

            const storagePrefix = `payambar:e2ee:${this.userId}`;
            const storedPrivate = localStorage.getItem(`${storagePrefix}:private_jwk`);
            const storedPublic = localStorage.getItem(`${storagePrefix}:public_jwk`);
            const storedDeviceId = localStorage.getItem(`${storagePrefix}:device_id`);
            const storedKeyId = localStorage.getItem(`${storagePrefix}:key_id`);

            const passwordForBackup = this.authPassword || '';
            let keysFromExistingSource = false;

            if (storedPrivate && storedPublic && storedDeviceId && storedKeyId) {
                this.e2ee.privateJwk = JSON.parse(storedPrivate);
                this.e2ee.publicJwk = JSON.parse(storedPublic);
                this.e2ee.deviceId = storedDeviceId;
                this.e2ee.keyId = storedKeyId;
                this.e2ee.ownerUserId = this.userId;
                keysFromExistingSource = true;
            } else if (passwordForBackup) {
                // Try restoring from server backup
                const myDevices = await this.getMyDeviceKeys();
                const backupDevice = (myDevices || []).find((d) => d.enc_private_key);
                if (backupDevice) {
                    try {
                        const { privateJwk, publicJwk } = await this.decryptPrivateKeyBackup(backupDevice, passwordForBackup);
                        this.e2ee.privateJwk = privateJwk;
                        this.e2ee.publicJwk = publicJwk;
                        this.e2ee.deviceId = backupDevice.device_id;
                        this.e2ee.keyId = backupDevice.key_id;
                        this.e2ee.ownerUserId = this.userId;
                        keysFromExistingSource = true;
                        localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(privateJwk));
                        localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(publicJwk));
                        localStorage.setItem(`${storagePrefix}:device_id`, backupDevice.device_id);
                        localStorage.setItem(`${storagePrefix}:key_id`, backupDevice.key_id);
                    } catch (err) {
                        console.warn('Failed to decrypt backed up key', err);
                        alert('بازیابی کلید امن با رمز عبور فعلی ممکن نیست. پیام‌های قدیمی ممکن است قابل خواندن نباشند.');
                    }
                } else {
                    if (!this.suppressBackupWarningOnce) {
                        alert('پشتیبان کلید امنی روی سرور پیدا نشد. کلید جدید ساخته می‌شود و پیام‌های رمزنگاری‌شده قبلی در این دستگاه قابل خواندن نیست.');
                    }
                }
            }

            if (!this.e2ee.privateJwk || !this.e2ee.publicJwk) {
                const keyPair = await window.crypto.subtle.generateKey(
                    { name: 'ECDH', namedCurve: 'P-256' },
                    true,
                    ['deriveBits']
                );
                const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
                const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
                const deviceId = (window.crypto.randomUUID ? window.crypto.randomUUID() : `web-${Date.now()}`);
                const keyId = `k-${Date.now()}`;
                localStorage.setItem(`${storagePrefix}:private_jwk`, JSON.stringify(privateJwk));
                localStorage.setItem(`${storagePrefix}:public_jwk`, JSON.stringify(publicJwk));
                localStorage.setItem(`${storagePrefix}:device_id`, deviceId);
                localStorage.setItem(`${storagePrefix}:key_id`, keyId);
                this.e2ee.privateJwk = privateJwk;
                this.e2ee.publicJwk = publicJwk;
                this.e2ee.deviceId = deviceId;
                this.e2ee.keyId = keyId;
                this.e2ee.ownerUserId = this.userId;
            }

            // Backup (and publish) device key
            let backupPayload = {};
            if (passwordForBackup) {
                try {
                    backupPayload = await this.encryptPrivateKeyForBackup(this.e2ee.privateJwk, passwordForBackup);
                } catch (err) {
                    console.warn('Encrypt private key for backup failed', err);
                }
            }

            try {
                const res = await fetch(`${API_URL}/keys/devices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
                    body: JSON.stringify({
                        device_id: this.e2ee.deviceId,
                        algorithm: 'ECDH-P256',
                        public_key: this.utf8ToBase64Url(JSON.stringify(this.e2ee.publicJwk)),
                        key_id: this.e2ee.keyId,
                        ...backupPayload,
                    }),
                });
                if (!res.ok) throw new Error('Device key publish failed');
            } catch (err) {
                console.warn('Failed to publish device key:', err);
                if (!keysFromExistingSource) {
                    // New keys that were never published — recipient can't decrypt
                    this.authPassword = '';
                    return false;
                }
                // Keys were previously published, local encryption still works
            }
            this.e2ee.ready = true;
            this.authPassword = '';
            this.suppressBackupWarningOnce = false;
            return true;
        },

        async getMyDeviceKeys() {
            const res = await fetch(`${API_URL}/keys/devices/self`, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.devices || [];
        },

        async encryptPrivateKeyForBackup(privateJwk, password) {
            return PayambarE2EE.encryptPrivateKeyForBackup(privateJwk, password);
        },

        async decryptPrivateKeyBackup(device, password) {
            return PayambarE2EE.decryptPrivateKeyBackup(device, password);
        },

        async derivePasswordKey(password, saltBytes, iterations) {
            return PayambarE2EE.derivePasswordKey(password, saltBytes, iterations);
        },
        async getUserDeviceKeys(userId) {
            const TTL_POPULATED_MS = 30000;
            const TTL_EMPTY_MS = 3000;
            const meta = this.e2ee.recipientKeyMeta[userId];
            if (this.e2ee.recipientKeys[userId] && meta && Date.now() - meta.fetchedAt < meta.ttl) {
                return this.e2ee.recipientKeys[userId];
            }
            if (this.e2ee.recipientKeyPromises[userId]) return this.e2ee.recipientKeyPromises[userId];

            const fetchPromise = (async () => {
                const res = await fetch(`${API_URL}/keys/users/${userId}/devices`, {
                    headers: { Authorization: `Bearer ${this.token}` },
                });
                if (!res.ok) throw new Error('failed to fetch device keys');
                const data = await res.json();
                const devices = (data.devices || []).filter((d) =>
                    (d.algorithm || '').toUpperCase() === 'ECDH-P256' && !!d.public_key
                );
                this.e2ee.recipientKeys[userId] = devices;
                this.e2ee.recipientKeyMeta[userId] = {
                    fetchedAt: Date.now(),
                    ttl: devices.length ? TTL_POPULATED_MS : TTL_EMPTY_MS,
                };
                return devices;
            })();

            this.e2ee.recipientKeyPromises[userId] = fetchPromise.finally(() => {
                delete this.e2ee.recipientKeyPromises[userId];
            });

            return fetchPromise;
        },
        async getRecipientDeviceKey(userId, { keyId = null, deviceId = null } = {}) {
            const devices = await this.getUserDeviceKeys(userId);
            if (!devices.length) return null;

            if (keyId || deviceId) {
                const matched = devices.find((d) =>
                    (!keyId || d.key_id === keyId) && (!deviceId || d.device_id === deviceId)
                );
                if (matched) return matched;
            }

            return devices[0] || null;
        },
        async deriveAesKeyFromDevice(device) {
            return PayambarE2EE.deriveAesKeyFromDevice(this.e2ee.privateJwk, device);
        },
        async encryptTextMessage(receiverId, plainText) {
            try {
                const ready = await this.ensureE2EEReady();
                if (!ready) return null;
                const device = await this.getRecipientDeviceKey(receiverId);
                if (!device) return null;
                return PayambarE2EE.encryptTextWithDevice(
                    this.e2ee.privateJwk,
                    this.e2ee.deviceId,
                    this.e2ee.keyId,
                    device,
                    plainText
                );
            } catch (err) {
                console.warn('E2EE encryption failed, will send plaintext:', err);
                return null;
            }
        },
        async maybeDecryptMessage(msg) {
            if (!msg?.encrypted || !msg?.ciphertext || !msg?.iv) return msg;
            try {
                const isOutgoing = Number(msg.sender_id) === Number(this.userId);
                const peerId = isOutgoing ? Number(msg.receiver_id) : Number(msg.sender_id);
                const device = await this.getRecipientDeviceKey(
                    peerId,
                    isOutgoing ? {} : { keyId: msg.key_id, deviceId: msg.sender_device_id }
                );
                if (!device) return { ...msg, content: '🔒 پیام رمزنگاری شده' };
                const content = await PayambarE2EE.decryptTextWithDevice(
                    this.e2ee.privateJwk,
                    device,
                    msg.iv,
                    msg.ciphertext
                );
                return { ...msg, content };
            } catch (err) {
                console.warn('Decrypt failed', err);
                return { ...msg, content: '🔒 پیام رمزنگاری شده (قابل خواندن نیست)' };
            }
        },
        async decryptMessageList(messages) {
            if (!Array.isArray(messages) || messages.length === 0) return [];
            return Promise.all(messages.map((m) => this.maybeDecryptMessage(m)));
        },
        formatDate(value) {
            return PayambarFuncs.formatDate(value);
        },
        formatTime(value) {
            return PayambarFuncs.formatTime(value);
        },
        formatStatus(msg) {
            return PayambarFuncs.formatStatus(msg);
        },
        getConversationPreview(conv) {
            return PayambarFuncs.getConversationPreview(conv, this.messages);
        },
        shouldShowMessageStatus(msg, index) {
            return PayambarFuncs.shouldShowMessageStatus(
                msg,
                index,
                this.messagesForCurrent,
                this.userId
            );
        },
        formatRecordingDuration(seconds) {
            return PayambarFuncs.formatRecordingDuration(seconds);
        },
        isAudioMessage(msg) {
            return PayambarFuncs.isAudioMessage(msg);
        },
        isImageMessage(msg) {
            return PayambarFuncs.isImageMessage(msg);
        },
        isVideoMessage(msg) {
            return PayambarFuncs.isVideoMessage(msg);
        },
        getMessageFileName(msg) {
            return PayambarFuncs.getMessageFileName(msg);
        },
        getPullBottomAllowance(el) {
            if (!el) return 12;
            const style = window.getComputedStyle(el);
            const paddingBottom = parseFloat(style.paddingBottom) || 0;
            return paddingBottom + 24;
        },
        isNearBottom(el) {
            if (!el) return false;
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            const allowance = this.getPullBottomAllowance(el);
            return distanceFromBottom <= (allowance + 160);
        },
        updatePullReady(container) {
            const el = container || document.querySelector('.messages-container');
            if (!el) return;
            this.pullToRefresh.ready = this.isNearBottom(el);
        },
        parseTimestamp(value) {
            return PayambarFuncs.parseTimestamp(value);
        },
        getConversationLastTimestamp(conv) {
            return PayambarFuncs.getConversationLastTimestamp(conv, this.messages);
        },
        getSortedConversations() {
            return PayambarFuncs.sortConversations(this.conversations, this.messages);
        },
        sortConversationsInPlace() {
            PayambarFuncs.sortConversationsInPlace(this.conversations, this.messages);
        },
        updateConversationLastMessage(userId, timestamp) {
            if (PayambarConversations.updateLastMessageAt(this.conversations, userId, timestamp)) {
                this.sortConversationsInPlace();
            }
        },
        async handleLogin() {
            this.authError = '';
            try {
                const data = await PayambarAuth.login(API_URL, {
                    username: this.login.username,
                    password: this.login.password,
                });
                this.authPassword = this.login.password;
                this.suppressBackupWarningOnce = false;
                this.setAuth(data);
            } catch (err) {
                this.authError = err.message;
            }
        },
        async handleRegister() {
            this.authError = '';
            const validation = PayambarAuth.validateRegister({
                acceptRules: this.acceptRules,
                password: this.register.password,
                confirm: this.register.confirm,
            });
            if (!validation.ok) {
                this.authError = validation.error;
                return;
            }
            try {
                const data = await PayambarAuth.register(API_URL, {
                    username: this.register.username,
                    password: this.register.password,
                });
                this.authPassword = this.register.password;
                this.suppressBackupWarningOnce = true; // first device has no backup; avoid warning
                this.setAuth(data);
            } catch (err) {
                this.authError = err.message;
            }
        },
        setAuth(data) {
            this.closeWebSocket(true);
            if (Number(this.userId) !== Number(data.user_id)) {
                this.resetE2EEState();
            }
            this.token = data.token;
            this.userId = data.user_id;
            this.username = data.username;
            PayambarAuth.persistSession(localStorage, {
                token: this.token,
                userId: this.userId,
                username: this.username,
            });
            this.loadConversations();
            this.loadMyProfile();
            // Ensure device key is registered as soon as the user is authenticated
            this.ensureE2EEReady().catch((err) => console.warn('E2EE init after auth failed', err));
            this.connectWebSocket();
            this.fetchWebRTCConfig();
        },
        resetE2EEState() {
            this.e2ee.ready = false;
            this.e2ee.ownerUserId = null;
            this.e2ee.deviceId = '';
            this.e2ee.keyId = '';
            this.e2ee.privateJwk = null;
            this.e2ee.publicJwk = null;
            this.e2ee.recipientKeys = {};
            this.e2ee.recipientKeyPromises = {};
            this.e2ee.recipientKeyMeta = {};
            this.e2ee.noKeyWarnedRecipients = {};
        },
        clearAuth() {
            this.resetE2EEState();
            this.token = null;
            this.userId = null;
            this.username = null;
            this.acceptRules = false;
            this.authPassword = '';
            this.conversations = [];
            this.messages = {};
            this.currentConversationId = null;
            this.currentConversationUsername = '';
            this.currentConversationDisplayName = '';
            this.currentConversationAvatarUrl = null;
            this.currentConversationIsOnline = false;
            this.closeProfileModal();
            this.activeProfileTab = 'profile';
            this.profileDisplayName = '';
            this.myAvatarUrl = null;
            this.deleteAccountConfirm = '';
            this.deletingAccount = false;
            this.showNewChatModal = false;
            this.newChatSearchQuery = '';
            this.newChatSearchResults = [];
            this.newChatSearchLoading = false;
            this.newChatSearchError = '';
            this.cleanupVoiceRecorder();
            this.conversationMenu = { show: false, x: 0, y: 0, conversation: null };
            this.serverOffline = false;
            this.wsReconnectAttempts = 0;
            if (this.newChatSearchTimeout) {
                clearTimeout(this.newChatSearchTimeout);
                this.newChatSearchTimeout = null;
            }
            PayambarAuth.clearSession(localStorage);
            this.closeWebSocket(true);
        },
        handleLogout() {
            if (confirm('آیا از خروج اطمینان دارید؟')) {
                this.clearAuth();
            }
        },
        openRulesModal() {
            this.showRulesModal = true;
        },
        closeRulesModal() {
            this.showRulesModal = false;
        },
        async fetchWebRTCConfig() {
            try {
                const res = await fetch(`${API_URL}/webrtc/config`, {
                    headers: { Authorization: `Bearer ${this.token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    this.iceServers = data.iceServers || [];
                }
            } catch (err) {
                console.error('Error fetching WebRTC config:', err);
                // Fallback to default Google STUN
                this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
            }
        },
        async loadMyProfile() {
            try {
                const res = await fetch(`${API_URL}/profile`, {
                    headers: { Authorization: `Bearer ${this.token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    this.profileDisplayName = data.display_name || '';
                    this.myAvatarUrl = data.avatar_url || null;
                }
            } catch (err) {
                console.error('Error loading profile:', err);
            }
        },
        async saveProfile() {
            try {
                const res = await fetch(`${API_URL}/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ display_name: this.profileDisplayName }),
                });
                if (!res.ok) throw new Error('Failed to save profile');
                this.closeProfileModal();
                this.showToast('پروفایل ذخیره شد');
            } catch (err) {
                console.error('Error saving profile:', err);
                alert('خطا در ذخیره پروفایل');
            }
        },
        // ── Push Notifications ─────────────────────────────────────────────
        async restorePushSubscription() {
            const stored = localStorage.getItem('pushNotificationsEnabled');
            if (stored === 'true') {
                this.pushNotificationsEnabled = true;
                // Re-subscribe silently to keep subscription fresh
                try {
                    await this.subscribePush();
                } catch (err) {
                    console.warn('Failed to restore push subscription:', err);
                }
            }
        },
        async togglePushNotifications() {
            if (this.pushNotificationsEnabled) {
                try {
                    await this.subscribePush();
                    localStorage.setItem('pushNotificationsEnabled', 'true');
                } catch (err) {
                    console.error('Push subscribe failed:', err);
                    this.pushNotificationsEnabled = false;
                    localStorage.removeItem('pushNotificationsEnabled');
                    alert('فعال‌سازی اعلان‌ها ناموفق بود');
                }
            } else {
                try {
                    await this.unsubscribePush();
                } catch (err) {
                    console.error('Push unsubscribe failed:', err);
                }
                localStorage.removeItem('pushNotificationsEnabled');
            }
        },
        async subscribePush() {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                throw new Error('Push notifications not supported');
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            // Get VAPID public key from server
            const vapidRes = await fetch(`${API_URL}/push/vapid-key`);
            if (!vapidRes.ok) throw new Error('Push not configured on server');
            const { vapid_public_key } = await vapidRes.json();

            // Convert VAPID key to Uint8Array
            const urlBase64ToUint8Array = (base64String) => {
                const padding = '='.repeat((4 - base64String.length % 4) % 4);
                const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                const raw = atob(base64);
                const arr = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
                return arr;
            };

            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
            });

            const subJSON = subscription.toJSON();
            const res = await fetch(`${API_URL}/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`,
                },
                body: JSON.stringify({
                    endpoint: subJSON.endpoint,
                    keys: {
                        p256dh: subJSON.keys.p256dh,
                        auth: subJSON.keys.auth,
                    },
                }),
            });
            if (!res.ok) throw new Error('Server rejected subscription');
        },
        async unsubscribePush() {
            try {
                const reg = await navigator.serviceWorker.ready;
                const subscription = await reg.pushManager.getSubscription();
                if (subscription) {
                    const subJSON = subscription.toJSON();
                    await fetch(`${API_URL}/push/subscribe`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${this.token}`,
                        },
                        body: JSON.stringify({ endpoint: subJSON.endpoint }),
                    });
                    await subscription.unsubscribe();
                }
            } catch (err) {
                console.warn('Unsubscribe error:', err);
            }
        },
        async deleteAccount() {
            if (!this.username || this.deleteAccountConfirm.trim() !== this.username) {
                alert('نام کاربری وارد شده صحیح نیست');
                return;
            }

            if (!confirm('این عملیات غیرقابل بازگشت است. آیا از حذف حساب اطمینان دارید؟')) {
                return;
            }

            this.deletingAccount = true;
            try {
                const res = await fetch(`${API_URL}/profile`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${this.token}` },
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || 'Delete failed');
                }
                this.clearAuth();
                alert('حساب کاربری حذف شد');
            } catch (err) {
                console.error('Error deleting account:', err);
                alert('خطا در حذف حساب');
            } finally {
                this.deletingAccount = false;
            }
        },
        async handleAvatarUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('لطفا یک فایل تصویری انتخاب کنید');
                return;
            }

            // Validate file size (2MB max)
            if (file.size > 2 * 1024 * 1024) {
                alert('حجم آواتار باید کمتر از ۲ مگابایت باشد');
                return;
            }

            this.uploadingAvatar = true;
            const formData = new FormData();
            formData.append('avatar', file);

            try {
                const res = await fetch(`${API_URL}/profile/avatar`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${this.token}` },
                    body: formData,
                });
                if (!res.ok) throw new Error('Upload failed');
                const data = await res.json();
                this.myAvatarUrl = data.avatar_url;
            } catch (err) {
                console.error('Avatar upload error:', err);
                alert('خطا در آپلود آواتار');
            } finally {
                this.uploadingAvatar = false;
                event.target.value = '';
            }
        },
        async loadConversations() {
            this.loadingConversations = true;
            try {
                const res = await PayambarConversations.fetchConversations(API_URL, this.token);
                if (!res.ok) {
                    if (res.status === 401) {
                        this.clearAuth();
                    }
                    return;
                }
                this.serverOffline = false;
                const data = await res.json();
                this.conversations = data.conversations || [];
                this.sortConversationsInPlace();
                this.hydrateEncryptedConversationPreviews();

                // Check if opened from an incoming call notification URL
                const urlParams = new URLSearchParams(window.location.search);
                const callFrom = urlParams.get('call_from');
                if (urlParams.get('auto_answer') === '1') {
                    this.pendingAutoAnswer = true;
                }
                if (callFrom && !this.currentConversationId) {
                    const targetConv = PayambarConversations.findByUserId(this.conversations, Number(callFrom));
                    if (targetConv) {
                        this.selectConversation(targetConv);
                    }
                    try {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    } catch (e) {}
                }
            } catch (err) {
                console.error(err);
                this.serverOffline = true;
            } finally {
                this.loadingConversations = false;
            }
        },
        async syncAfterResume() {
            await this.loadConversations();
            if (this.currentConversationId) {
                await this.refreshCurrentConversation({ keepScroll: true });
            }
        },
        hydrateEncryptedConversationPreviews() {
            const needing = PayambarConversations.conversationsNeedingPreviewHydration(
                this.conversations,
                this.messages
            );
            for (const conv of needing) {
                this.refreshConversationPreview(conv.user_id).catch((err) => {
                    console.warn('Failed to refresh conversation preview:', err);
                });
            }
        },
        async refreshConversationPreview(userId) {
            if (!userId || this.messages[userId]?.length) return;
            const res = await PayambarMessages.fetchMessages(API_URL, this.token, {
                userId,
                limit: 1,
            });
            if (!res.ok) return;
            const data = await res.json();
            const latestMessages = await this.decryptMessageList(data.messages || []);
            if (latestMessages.length) {
                this.messages[userId] = latestMessages;
            }
        },
        async selectConversation(conv) {
            this.closeConversationMenu();
            this.currentConversationId = conv.user_id;
            this.currentConversationUsername = conv.username;
            this.currentConversationDisplayName = conv.display_name || '';
            this.currentConversationAvatarUrl = conv.avatar_url || null;
            this.currentConversationIsOnline = conv.is_online || false;
            this.loadingMessages = true;
            this.chatListOpen = false;

            // Reset unread count for this conversation in UI
            PayambarConversations.clearUnreadCount(this.conversations, conv.user_id);

            try {
                const res = await PayambarMessages.fetchMessages(API_URL, this.token, {
                    userId: conv.user_id,
                    limit: 50,
                });
                if (!res.ok) {
                    if (res.status === 401) {
                        this.clearAuth();
                        return;
                    }
                    if (res.status === 404) {
                        this.closeConversation();
                        this.loadConversations();
                        return;
                    }
                    throw new Error('Failed to load messages');
                }
                const data = await res.json();
                this.messages[conv.user_id] = await this.decryptMessageList(data.messages || []);
                this.hasMoreMessages[conv.user_id] = PayambarMessages.hasMoreMessages(data.messages || []);

                const latestMessage = this.messages[conv.user_id].length
                    ? this.messages[conv.user_id][this.messages[conv.user_id].length - 1]
                    : null;
                if (latestMessage?.created_at) {
                    this.updateConversationLastMessage(conv.user_id, latestMessage.created_at);
                }

                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    for (const messageId of PayambarMessages.unreadIncomingIds(
                        this.messages[conv.user_id],
                        this.userId
                    )) {
                        this.ws.send(JSON.stringify({ type: 'mark_read', message_id: messageId }));
                    }
                }

                this.$nextTick(() => {
                    setTimeout(() => this.scrollToBottom(), 100);
                });
            } catch (err) {
                console.error(err);
                this.messages[conv.user_id] = [];
            } finally {
                this.loadingMessages = false;
            }
        },
        async sendMessage() {
            const content = (this.messageText || '').trim();
            if (!content || !this.currentConversationId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            const receiverId = Number(this.currentConversationId);
            const clientMessageId = `client-${Date.now()}`;
            const msg = PayambarMessages.buildOptimisticTextMessage({
                userId: this.userId,
                receiverId,
                content,
                clientMessageId,
            });
            if (!this.messages[receiverId]) this.messages[receiverId] = [];
            this.messages[receiverId].push(msg);
            this.updateConversationLastMessage(receiverId, msg.created_at);
            this.messageText = '';
            this.chatListOpen = false;
            this.$nextTick(() => {
                this.resizeMessageInput();
                this.focusMessageInput();
            });

            let encryptedPayload = null;
            try {
                encryptedPayload = await this.encryptTextMessage(receiverId, content);
            } catch (err) {
                console.warn('Encryption error, sending plaintext:', err);
            }
            if (this.e2ee.enabled && !encryptedPayload && !this.e2ee.noKeyWarnedRecipients[receiverId]) {
                alert('ارسال امن ممکن نیست؛ کلید مخاطب در دسترس نیست. پیام به صورت غیر رمزنگاری‌شده ارسال می‌شود.');
                this.e2ee.noKeyWarnedRecipients[receiverId] = true;
            }

            const payload = PayambarMessages.buildWsTextPayload({
                receiverId,
                content,
                clientMessageId,
                encryptedPayload,
            });

            this.ws.send(JSON.stringify(payload));
            this.$nextTick(() => {
                this.scrollToBottom();
                this.focusMessageInput();
            });
        },
        resizeMessageInput() {
            const input = this.$refs.messageInput;
            if (!input) return;
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        },
        handleMessageKeydown(event) {
            if (event.key !== 'Enter' || !event.shiftKey || event.isComposing) return;
            event.preventDefault();
            this.sendMessage();
        },
        focusMessageInput() {
            const input = this.$refs.messageInput;
            if (input && typeof input.focus === 'function') {
                input.focus({ preventScroll: true });
            }
        },
        async sendFileMessage(file) {
            if (!file || !this.currentConversationId) return;

            const receiverId = Number(this.currentConversationId);
            this.uploadingFile = true;
            const formData = new FormData();
            formData.append('file', file);
            formData.append('receiver_id', receiverId);

            try {
                const res = await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${this.token}` },
                    body: formData,
                });
                if (!res.ok) throw new Error('Upload failed');
                const data = await res.json();
                const messageID = Number(data.message_id);
                const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;

                // Single source of truth to prevent duplicates:
                // when WS is connected, wait for WS echo and do not append locally.
                if (!wsOpen) {
                    const createdAt = new Date().toISOString();
                    const msg = PayambarMessages.buildOfflineFileMessage({
                        messageId: messageID,
                        userId: this.userId,
                        receiverId,
                        fileName: data.file_name,
                        fileUrl: data.file_url,
                        fileContentType: data.file_content_type || file.type || '',
                        createdAt,
                    });
                    PayambarMessages.upsertOfflineFileMessage(this.messages, receiverId, msg);
                    this.updateConversationLastMessage(receiverId, createdAt);
                    if (Number(this.currentConversationId) === receiverId) {
                        this.$nextTick(() => this.scrollToBottom());
                    }
                }
                this.loadConversations();
            } catch (err) {
                console.error('File upload error:', err);
                alert('خطا در آپلود فایل');
            } finally {
                this.uploadingFile = false;
            }
        },
        async handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file || !this.currentConversationId) return;
            await this.sendFileMessage(file);
            event.target.value = ''; // Reset file input
        },
        cleanupVoiceRecorder() {
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
            if (this.mediaRecorder) {
                this.mediaRecorder.ondataavailable = null;
                this.mediaRecorder.onstop = null;
                this.mediaRecorder = null;
            }
            if (this.recordingStream) {
                this.recordingStream.getTracks().forEach((track) => track.stop());
                this.recordingStream = null;
            }
            this.recordedChunks = [];
            this.recordingVoice = false;
            this.recordingElapsedSec = 0;
        },
        async toggleVoiceRecording() {
            if (!this.currentConversationId || this.uploadingFile || this.sendingVoice) return;
            if (this.recordingVoice) {
                this.stopVoiceRecordingAndSend();
                return;
            }
            await this.startVoiceRecording();
        },
        async startVoiceRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
                const recorder = preferredType
                    ? new MediaRecorder(stream, { mimeType: preferredType })
                    : new MediaRecorder(stream);

                this.recordedChunks = [];
                this.recordingStream = stream;
                this.mediaRecorder = recorder;
                this.recordingVoice = true;
                this.recordingElapsedSec = 0;

                recorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };

                recorder.onstop = async () => {
                    const mimeType = recorder.mimeType || 'audio/webm';
                    const blob = new Blob(this.recordedChunks, { type: mimeType });
                    this.cleanupVoiceRecorder();

                    if (blob.size === 0) return;
                    this.sendingVoice = true;
                    const extension = mimeType.includes('ogg')
                        ? 'ogg'
                        : (mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'webm');
                    const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
                    await this.sendFileMessage(file);
                    this.sendingVoice = false;
                };

                recorder.start(250);
                this.recordingTimer = setInterval(() => {
                    this.recordingElapsedSec += 1;
                }, 1000);
            } catch (err) {
                console.error('Voice recording error:', err);
                alert('دسترسی میکروفون لازم است');
                this.cleanupVoiceRecorder();
            }
        },
        stopVoiceRecordingAndSend() {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
            this.recordingVoice = false;
            this.mediaRecorder.stop();
        },
        scrollToBottom(attempts = 0) {
            const container = document.querySelector('.messages-container');
            if (container) {
                // Use requestAnimationFrame for smoother scrolling on mobile
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                    this.updatePullReady(container);

                    // On mobile, sometimes need multiple attempts due to rendering delays
                    if (attempts < 3 && container.scrollTop < container.scrollHeight - container.clientHeight - 50) {
                        setTimeout(() => this.scrollToBottom(attempts + 1), 100);
                    }
                });
            }
        },
        handleMessagesScroll(event) {
            const container = event.target;
            this.updatePullReady(container);
            // Load more when scrolled near top (within 100px)
            if (container.scrollTop < 100 && !this.loadingOlderMessages && this.hasMoreMessages[this.currentConversationId]) {
                this.loadOlderMessages();
            }
        },
        async loadOlderMessages() {
            if (!this.currentConversationId || this.loadingOlderMessages) return;

            const conversationId = Number(this.currentConversationId);
            const currentMessages = this.messages[conversationId] || [];
            if (currentMessages.length === 0) return;

            this.loadingOlderMessages = true;
            const container = document.querySelector('.messages-container');
            const oldScrollHeight = container ? container.scrollHeight : 0;

            try {
                const offset = currentMessages.length;
                const res = await PayambarMessages.fetchMessages(API_URL, this.token, {
                    userId: conversationId,
                    limit: 50,
                    offset,
                });
                if (!res.ok) {
                    if (res.status === 404) {
                        this.closeConversation();
                        this.loadConversations();
                    }
                    return;
                }

                const data = await res.json();
                const olderMessages = await this.decryptMessageList(data.messages || []);

                if (olderMessages.length > 0) {
                    this.messages[conversationId] = [...olderMessages, ...currentMessages];

                    this.$nextTick(() => {
                        if (container) {
                            const newScrollHeight = container.scrollHeight;
                            container.scrollTop = newScrollHeight - oldScrollHeight;
                        }
                    });
                }

                this.hasMoreMessages[conversationId] = PayambarMessages.hasMoreMessages(olderMessages);
            } catch (err) {
                console.error('Error loading older messages:', err);
            } finally {
                this.loadingOlderMessages = false;
            }
        },
        // Pull to refresh methods
        handlePullStart(event) {
            if (!this.currentConversationId || this.pullToRefresh.refreshing) return;
            const container = document.querySelector('.messages-container');
            if (!container) return;
            // Only enable pull-to-refresh when at end of messages
            if (!this.isNearBottom(container)) return;
            this.pullToRefresh.ready = true;

            const touch = event.touches ? event.touches[0] : event;
            this.pullToRefresh.startY = touch.clientY;
            this.pullToRefresh.pulling = true;
        },
        handlePullMove(event) {
            if (!this.pullToRefresh.pulling || this.pullToRefresh.refreshing) return;

            const touch = event.touches ? event.touches[0] : event;
            const deltaY = touch.clientY - this.pullToRefresh.startY;

            // Only pull up when at bottom
            if (deltaY < 0) {
                const magnitude = Math.abs(deltaY);
                this.pullToRefresh.currentY = Math.min(magnitude, this.pullToRefresh.threshold * 1.5);
                // Prevent default scroll when pulling up past the end
                if (magnitude > 10) {
                    event.preventDefault();
                }
            } else {
                this.pullToRefresh.currentY = 0;
            }
        },
        async handlePullEnd() {
            if (!this.pullToRefresh.pulling) return;

            if (this.pullToRefresh.currentY >= this.pullToRefresh.threshold) {
                this.pullToRefresh.refreshing = true;
                await this.refreshCurrentConversation();
                this.pullToRefresh.refreshing = false;
            }

            this.pullToRefresh.pulling = false;
            this.pullToRefresh.startY = 0;
            this.pullToRefresh.currentY = 0;
            this.updatePullReady();
        },
        async refreshCurrentConversation(options = {}) {
            if (!this.currentConversationId) return;

            const conversationId = Number(this.currentConversationId);
            const container = document.querySelector('.messages-container');
            const wasNearBottom = this.isNearBottom(container);
            try {
                const res = await PayambarMessages.fetchMessages(API_URL, this.token, {
                    userId: conversationId,
                    limit: 50,
                });
                if (!res.ok) {
                    if (res.status === 404) {
                        this.closeConversation();
                        this.loadConversations();
                    }
                    return;
                }

                const data = await res.json();
                this.messages[conversationId] = await this.decryptMessageList(data.messages || []);
                this.hasMoreMessages[conversationId] = PayambarMessages.hasMoreMessages(data.messages || []);

                const latestMessage = this.messages[conversationId].length
                    ? this.messages[conversationId][this.messages[conversationId].length - 1]
                    : null;
                if (latestMessage?.created_at) {
                    this.updateConversationLastMessage(conversationId, latestMessage.created_at);
                }

                if (!options.keepScroll || wasNearBottom) {
                    this.$nextTick(() => this.scrollToBottom());
                }
                this.updatePullReady();

                this.loadConversations();
            } catch (err) {
                console.error('Error refreshing conversation:', err);
            }
        },
        goBackToList() {
            this.closeConversation();
        },
        closeConversation() {
            this.currentConversationId = null;
            this.currentConversationUsername = '';
            this.currentConversationDisplayName = '';
            this.currentConversationAvatarUrl = null;
            this.currentConversationIsOnline = false;
            this.chatListOpen = true;
        },
        closeWebSocket(intentional = true) {
            this.wsIntentionalClose = intentional;
            this.wsConnected = false;
            if (this.wsReconnectTimer) {
                clearTimeout(this.wsReconnectTimer);
                this.wsReconnectTimer = null;
            }
            if (this.ws) {
                try { this.ws.close(); } catch (e) { }
                this.ws = null;
            }
            if (intentional) {
                this.wsReconnectAttempts = 0;
                this.serverOffline = false;
            }
        },
        connectWebSocket() {
            if (
                !PayambarWs.canConnect({
                    isAuthed: this.isAuthed,
                    token: this.token,
                    existingWs: this.ws,
                })
            ) {
                return;
            }
            if (this.wsReconnectTimer) {
                clearTimeout(this.wsReconnectTimer);
                this.wsReconnectTimer = null;
            }
            this.wsIntentionalClose = false;
            this.wsConnected = false;

            this.ws = PayambarWs.createConnection({
                wsUrl: WS_URL,
                token: this.token,
                onOpen: () => {
                    this.wsReconnectAttempts = 0;
                    this.serverOffline = false;
                    this.wsConnected = true;
                },
                onMessage: (data) => {
                    this.handleWebSocketMessage(data);
                },
                onError: (err) => {
                    if (!this.isAuthed || this.wsIntentionalClose) {
                        return;
                    }
                    console.error('WebSocket error:', err);
                    this.serverOffline = true;
                    this.wsConnected = false;
                },
                onClose: () => {
                    const intentionalClose = this.wsIntentionalClose;
                    this.ws = null;
                    this.wsConnected = false;
                    if (
                        !PayambarWs.shouldReconnect({
                            isAuthed: this.isAuthed,
                            intentionalClose: intentionalClose || !this.isAuthed,
                            attempts: this.wsReconnectAttempts,
                            maxAttempts: this.wsMaxReconnectAttempts,
                        })
                    ) {
                        if (intentionalClose || !this.isAuthed) {
                            this.wsIntentionalClose = false;
                        }
                        if (!intentionalClose && this.isAuthed) {
                            this.serverOffline = true;
                        }
                        return;
                    }
                    this.serverOffline = true;
                    this.wsReconnectAttempts++;
                    const delay = PayambarWs.reconnectDelay(
                        this.wsReconnectAttempts,
                        this.wsReconnectBaseDelay,
                        this.wsReconnectMaxDelay
                    );
                    this.wsReconnectTimer = setTimeout(() => {
                        this.wsReconnectTimer = null;
                        this.connectWebSocket();
                    }, delay);
                },
            });
        },
        async handleWebSocketMessage(data) {
            if (data.type === 'call_offer') {
                if (this.activeCall || this.incomingCall || this.outgoingCall) {
                    this.ws.send(JSON.stringify({ type: 'call_reject', receiver_id: data.sender_id, payload: { reason: 'busy' } }));
                    return;
                }
                // Fetch sender info if not in conversations
                const sender =
                    PayambarConversations.findByUserId(this.conversations, data.sender_id) ||
                    { username: 'کاربر', user_id: data.sender_id };
                this.pendingIceCandidates = [];
                this.incomingCall = {
                    sender_id: Number(data.sender_id),
                    username: sender.username,
                    displayName: sender.display_name,
                    avatar_url: sender.avatar_url,
                    offer: data.payload.offer
                };
                if (!sender.display_name && sender.username === 'کاربر') {
                    fetch(`${API_URL}/users/${data.sender_id}`, {
                        headers: { Authorization: `Bearer ${this.token}` }
                    }).then(r => r.json()).then(user => {
                        if (this.incomingCall && this.incomingCall.sender_id === Number(data.sender_id)) {
                            this.incomingCall.username = user.username;
                            this.incomingCall.displayName = user.display_name;
                            this.incomingCall.avatar_url = user.avatar_url;
                        }
                    }).catch(() => {});
                }

                if (this.pendingAutoAnswer) {
                    this.pendingAutoAnswer = false;
                    this.$nextTick(() => {
                        this.acceptCall();
                    });
                    return;
                }
                // Show notification if app is in background or screen off
                if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
                    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                        navigator.serviceWorker.ready.then(reg => {
                            reg.showNotification('📞 تماس صوتی ورودی', {
                                body: `تماس از طرف ${sender.display_name || sender.username}`,
                                icon: '/favicon-192.png',
                                badge: '/favicon-96.png',
                                tag: `incoming-call-${data.sender_id}`,
                                requireInteraction: true,
                                vibrate: [300, 200, 300, 200, 500, 200, 500],
                                data: { url: `/?call_from=${data.sender_id}`, type: 'incoming_call', caller_id: data.sender_id },
                                actions: [
                                    { action: 'answer', title: '📞 پاسخ' },
                                    { action: 'decline', title: '✖ رد' }
                                ]
                            });
                        }).catch(() => {});
                    }
                }
            } else if (data.type === 'call_answer') {
                console.log('[WebRTC] Received call_answer from:', data.sender_id, 'outgoingCall:', this.outgoingCall);
                if (this.outgoingCall && Number(this.outgoingCall.receiver_id) === Number(data.sender_id)) {
                    try {
                        console.log('[WebRTC] Setting remote description from answer...');
                        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload.answer));
                        console.log('[WebRTC] Flushing pending ICE candidates...');
                        await this.flushPendingIceCandidates();
                        this.activeCall = { ...this.outgoingCall, user_id: Number(this.outgoingCall.receiver_id) };
                        this.outgoingCall = null;
                        this.startCallTimer();
                        this.acquireWakeLock();
                        this.setupMediaSession(this.activeCall.displayName || this.activeCall.username);
                        this.dismissCallNotification();
                        console.log('[WebRTC] Call is now active!');
                    } catch (err) {
                        console.error('[WebRTC] Error handling call_answer:', err);
                    }
                } else {
                    console.warn('[WebRTC] Received call_answer but outgoingCall did not match:', {
                        outgoingCall: this.outgoingCall,
                        senderId: data.sender_id
                    });
                }
            } else if (data.type === 'ice_candidate') {
                await this.handleIncomingIceCandidate(data.payload?.candidate);
            } else if (data.type === 'call_reject') {
                this.dismissCallNotification();
                if (this.outgoingCall && Number(this.outgoingCall.receiver_id) === Number(data.sender_id)) {
                    alert('تماس رد شد');
                    this.endCall(false);
                }
            } else if (data.type === 'call_hangup') {
                this.dismissCallNotification();
                if ((this.activeCall && Number(this.activeCall.user_id) === Number(data.sender_id)) ||
                    (this.incomingCall && Number(this.incomingCall.sender_id) === Number(data.sender_id))) {
                    this.endCall(false);
                }
            } else if (data.type === 'message') {
                const normalizedMessage = await this.maybeDecryptMessage(data);
                const incomingContent = normalizedMessage.content;
                const senderId = Number(data.sender_id);
                const { convUser } = PayambarMessages.applyIncomingMessage(
                    this.messages,
                    this.userId,
                    data,
                    incomingContent
                );

                PayambarConversations.updateLastMessageAt(
                    this.conversations,
                    convUser,
                    data.created_at || new Date().toISOString()
                );

                if (Number(this.currentConversationId) === convUser) {
                    this.ws?.send(JSON.stringify({ type: 'mark_delivered', message_id: data.message_id }));
                    this.ws?.send(JSON.stringify({ type: 'mark_read', message_id: data.message_id }));
                    this.$nextTick(() => this.scrollToBottom());
                } else if (senderId !== Number(this.userId)) {
                    PayambarConversations.bumpUnreadCount(this.conversations, convUser);
                }

                this.loadConversations();
            } else if (data.type === 'status_update') {
                PayambarFuncs.updateMessageStatus(this.messages, data.message_id, data.status);
            }
        },
        openNewChat() {
            this.showNewChatModal = true;
            this.newChatSearchQuery = '';
            this.newChatSearchResults = [];
            this.newChatSearchError = '';
            this.newChatSearchLoading = false;
            this.$nextTick(() => {
                const input = this.$refs.newChatSearchInput;
                if (input && typeof input.focus === 'function') {
                    input.focus();
                }
            });
        },
        closeNewChatModal() {
            this.showNewChatModal = false;
            this.newChatSearchQuery = '';
            this.newChatSearchResults = [];
            this.newChatSearchError = '';
            this.newChatSearchLoading = false;
            if (this.newChatSearchTimeout) {
                clearTimeout(this.newChatSearchTimeout);
                this.newChatSearchTimeout = null;
            }
        },
        onNewChatSearchInput() {
            const query = this.newChatSearchQuery.trim();
            this.newChatSearchError = '';
            if (this.newChatSearchTimeout) {
                clearTimeout(this.newChatSearchTimeout);
                this.newChatSearchTimeout = null;
            }
            if (!query || query.length < 3) {
                this.newChatSearchLoading = false;
                this.newChatSearchResults = [];
                return;
            }
            this.newChatSearchLoading = true;
            this.newChatSearchTimeout = setTimeout(() => {
                this.searchUsersForNewChat(query);
            }, NEW_CHAT_SEARCH_DEBOUNCE_MS);
        },
        async searchUsersForNewChat(query) {
            try {
                const res = await fetch(`${API_URL}/users?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${this.token}` }
                });
                if (!res.ok) throw new Error('Search failed');
                const users = await res.json();
                this.newChatSearchResults = Array.isArray(users) ? users : [];
            } catch (err) {
                console.error('Search error:', err);
                this.newChatSearchResults = [];
                this.newChatSearchError = 'خطا در جستجو';
            } finally {
                this.newChatSearchLoading = false;
                this.newChatSearchTimeout = null;
            }
        },
        async handleSelectSearchedUser(user) {
            await this.startConversation(
                user.id,
                user.username,
                user.displayName,
                user.avatarUrl,
                user.isOnline
            );
            this.closeNewChatModal();
        },
        async startConversation(userId, username, displayName = '', avatarUrl = '', isOnline = false) {
            console.log('Starting conversation with:', userId, username);
            const existing = PayambarConversations.findByUserId(this.conversations, userId);
            if (existing) {
                console.log('Found existing conversation:', existing);
                existing.is_online = isOnline;
                this.selectConversation(existing);
                return;
            }
            try {
                const conversation = await PayambarConversations.createConversation(
                    API_URL,
                    this.token,
                    userId
                );
                console.log('Created conversation:', conversation);
                this.conversations.unshift(conversation);
                console.log('Conversations after adding:', this.conversations);
                this.selectConversation(conversation);
            } catch (err) {
                console.error('Error starting conversation:', err);
                alert('خطا در ایجاد مکالمه');
            }
        },
        // Context menu methods
        openContextMenu(event, message) {
            const targetRect = event?.currentTarget?.getBoundingClientRect
                ? event.currentTarget.getBoundingClientRect()
                : null;

            const padding = 12;
            const menuWidth = 160;
            const menuHeight = Number(message.sender_id) === Number(this.userId) ? 104 : 56;

            let x = targetRect ? targetRect.left : (event.clientX || event.pageX || 0);
            let y = targetRect ? targetRect.bottom : (event.clientY || event.pageY || 0);

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (x + menuWidth + padding > viewportWidth) {
                x = viewportWidth - menuWidth - padding;
            }
            if (x < padding) x = padding;

            if (y + menuHeight + padding > viewportHeight) {
                y = targetRect ? targetRect.top - menuHeight : viewportHeight - menuHeight - padding;
            }
            if (y < padding) y = padding;

            this.contextMenu = {
                show: true,
                x,
                y,
                message,
            };
            this.$nextTick(() => {
                document.getElementById('message-context-menu')?.showPopover();
            });
        },
        closeContextMenu() {
            document.getElementById('message-context-menu')?.hidePopover();
            this.contextMenu.show = false;
            this.contextMenu.message = null;
        },
        openConversationMenu(event, conversation) {
            const targetRect = event?.currentTarget?.getBoundingClientRect
                ? event.currentTarget.getBoundingClientRect()
                : null;

            const padding = 12;
            const menuWidth = 160;
            const menuHeight = 56;

            let x = targetRect ? targetRect.left : (event.clientX || event.pageX || 0);
            let y = targetRect ? targetRect.bottom : (event.clientY || event.pageY || 0);

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (x + menuWidth + padding > viewportWidth) {
                x = viewportWidth - menuWidth - padding;
            }
            if (x < padding) x = padding;

            if (y + menuHeight + padding > viewportHeight) {
                y = targetRect ? targetRect.top - menuHeight : viewportHeight - menuHeight - padding;
            }
            if (y < padding) y = padding;

            this.conversationMenu = {
                show: true,
                x,
                y,
                conversation,
            };
            this.$nextTick(() => {
                document.getElementById('conversation-menu')?.showPopover();
            });
        },
        closeConversationMenu() {
            document.getElementById('conversation-menu')?.hidePopover();
            this.conversationMenu.show = false;
            this.conversationMenu.conversation = null;
        },
        async deleteConversation(conversation) {
            if (!conversation || !conversation.id) {
                this.closeConversationMenu();
                return;
            }

            if (!confirm('آیا از حذف این مکالمه اطمینان دارید؟')) {
                this.closeConversationMenu();
                return;
            }

            try {
                const res = await PayambarConversations.deleteConversation(
                    API_URL,
                    this.token,
                    conversation.id
                );

                if (!res.ok) {
                    if (res.status === 404) {
                        this.closeConversation();
                        this.loadConversations();
                        return;
                    }
                    const errData = await res.json();
                    throw new Error(errData.error || 'Delete failed');
                }

                this.conversations = this.conversations.filter(c => c.id !== conversation.id);
                delete this.messages[conversation.user_id];

                if (this.currentConversationId === conversation.user_id) {
                    this.closeConversation();
                }

                this.loadConversations();
            } catch (err) {
                console.error('Error deleting conversation:', err);
                alert('خطا در حذف مکالمه');
            } finally {
                this.closeConversationMenu();
            }
        },
        async copyMessage() {
            const message = this.contextMenu.message;
            if (!message || !message.content) {
                this.closeContextMenu();
                return;
            }
            const text = String(message.content);
            try {
                if (window.navigator.clipboard?.writeText) {
                    await window.navigator.clipboard.writeText(text);
                } else {
                    this.copyTextFallback(text);
                }
                this.showToast("کپی شد");
            } catch (err) {
                try {
                    this.copyTextFallback(text);
                    this.showToast("کپی شد");
                } catch (fallbackErr) {
                    console.error('Copy failed:', err, fallbackErr);
                    this.showToast("کپی نشد");
                }
            }
            this.closeContextMenu();
        },
        copyTextFallback(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-1000px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (!ok) throw new Error('copy command failed');
        },
        showToast(message) {
            const toast = document.getElementById("toast");
            toast.textContent = message;
            toast.classList.add("show");

            setTimeout(() => toast.classList.remove("show"), 1000);
        },

        async deleteMessage() {
            const message = this.contextMenu.message;
            if (!message || !message.id) {
                this.closeContextMenu();
                return;
            }

            if (!confirm('آیا از حذف این پیام اطمینان دارید؟')) {
                this.closeContextMenu();
                return;
            }

            try {
                const res = await PayambarMessages.deleteMessage(API_URL, this.token, message.id);

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || 'Delete failed');
                }

                PayambarMessages.removeMessageById(
                    this.messages,
                    this.currentConversationId,
                    message.id
                );
            } catch (err) {
                console.error('Error deleting message:', err);
                alert('خطا در حذف پیام');
            } finally {
                this.closeContextMenu();
            }
        },
        // WebRTC Call Methods
        async startCall() {
            if (this.activeCall || this.outgoingCall || this.incomingCall) return;
            if (Number(this.currentConversationId) === Number(this.userId)) return;

            const receiverId = Number(this.currentConversationId);
            const username = this.currentConversationUsername;
            const displayName = this.currentConversationDisplayName;
            const avatarUrl = this.currentConversationAvatarUrl;

            this.outgoingCall = { receiver_id: receiverId, username, displayName, avatarUrl, status: 'calling' };

            try {
                console.log('[WebRTC] startCall: Getting user media...');
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                this.localStream.getAudioTracks().forEach(track => {
                    track.onmute = () => console.warn('[WebRTC] Local microphone track muted by OS (screen lock or background)');
                    track.onunmute = () => console.log('[WebRTC] Local microphone track unmuted');
                });
                console.log('[WebRTC] startCall: Got local stream with tracks:', this.localStream.getTracks().map(t => t.kind + ':' + t.enabled));
                this.acquireWakeLock();
                this.setupPeerConnection(receiverId);
                this.localStream.getTracks().forEach(track => {
                    console.log('[WebRTC] startCall: Adding track:', track.kind, track.enabled);
                    this.peerConnection.addTrack(track, this.localStream);
                });

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                this.ws.send(JSON.stringify({
                    type: 'call_offer',
                    receiver_id: receiverId,
                    payload: { offer }
                }));
            } catch (err) {
                console.error('Failed to start call:', err);
                alert('خطا در دسترسی به میکروفون');
                this.endCall();
            }
        },
        async acceptCall() {
            if (!this.incomingCall) return;
            const senderId = Number(this.incomingCall.sender_id);

            try {
                console.log('[WebRTC] acceptCall: Getting user media...');
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                this.localStream.getAudioTracks().forEach(track => {
                    track.onmute = () => console.warn('[WebRTC] Local microphone track muted by OS (screen lock or background)');
                    track.onunmute = () => console.log('[WebRTC] Local microphone track unmuted');
                });
                console.log('[WebRTC] acceptCall: Got local stream with tracks:', this.localStream.getTracks().map(t => t.kind + ':' + t.enabled));
                this.acquireWakeLock();
                this.setupPeerConnection(senderId);
                this.localStream.getTracks().forEach(track => {
                    console.log('[WebRTC] acceptCall: Adding track:', track.kind, track.enabled);
                    this.peerConnection.addTrack(track, this.localStream);
                });

                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.incomingCall.offer));
                await this.flushPendingIceCandidates();
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                this.ws.send(JSON.stringify({
                    type: 'call_answer',
                    receiver_id: senderId,
                    payload: { answer }
                }));

                this.activeCall = {
                    user_id: senderId,
                    username: this.incomingCall.username,
                    displayName: this.incomingCall.displayName,
                    avatar_url: this.incomingCall.avatar_url
                };
                this.setupMediaSession(this.activeCall.displayName || this.activeCall.username);
                this.dismissCallNotification();
                this.incomingCall = null;
                this.startCallTimer();
            } catch (err) {
                console.error('Failed to accept call:', err);
                alert('خطا در دسترسی به میکروفون');
                this.rejectCall();
            }
        },
        rejectCall() {
            this.dismissCallNotification();
            if (!this.incomingCall) return;
            this.ws.send(JSON.stringify({
                type: 'call_reject',
                receiver_id: Number(this.incomingCall.sender_id)
            }));
            this.saveCallLogMessage(this.incomingCall.sender_id, 'تماس ناموفق');
            this.pendingIceCandidates = [];
            this.incomingCall = null;
        },
        endCall(isInitiator = true) {
            this.releaseWakeLock();
            this.cleanupMediaSession();
            this.dismissCallNotification();

            if (this.activeCall) {
                if (isInitiator) {
                    this.ws.send(JSON.stringify({
                        type: 'call_hangup',
                        receiver_id: Number(this.activeCall.user_id)
                    }));
                    const duration = this.callDuration ? ` (${this.callDuration})` : '';
                    this.saveCallLogMessage(this.activeCall.user_id, `تماس صوتی${duration}`);
                }
            } else if (this.outgoingCall) {
                if (isInitiator) {
                    this.ws.send(JSON.stringify({
                        type: 'call_hangup',
                        receiver_id: Number(this.outgoingCall.receiver_id)
                    }));
                    this.saveCallLogMessage(this.outgoingCall.receiver_id, 'تماس ناموفق');
                }
            }

            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            const remoteAudio = document.getElementById('remote-audio');
            if (remoteAudio) remoteAudio.srcObject = null;

            this.pendingIceCandidates = [];
            this.stopCallTimer();
            this.activeCall = null;
            this.outgoingCall = null;
            this.incomingCall = null;
        },
        async handleIncomingIceCandidate(candidate) {
            if (!candidate) return;
            // Queue until peer connection exists and remote description is set
            // (callee is still ringing, or caller is still waiting for answer).
            if (!this.peerConnection || !this.peerConnection.remoteDescription) {
                this.pendingIceCandidates.push(candidate);
                return;
            }
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('[WebRTC] addIceCandidate failed:', err);
            }
        },
        async flushPendingIceCandidates() {
            if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
            const pending = this.pendingIceCandidates.splice(0);
            for (const candidate of pending) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error('[WebRTC] flush addIceCandidate failed:', err);
                }
            }
        },
        setupPeerConnection(otherUserId) {
            console.log('[WebRTC] Setting up peer connection with ICE servers:', this.iceServers);
            this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('[WebRTC] Sending ICE candidate:', event.candidate.type, event.candidate.address);
                    this.ws.send(JSON.stringify({
                        type: 'ice_candidate',
                        receiver_id: otherUserId,
                        payload: { candidate: event.candidate }
                    }));
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);
            };

            this.peerConnection.onconnectionstatechange = () => {
                console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
            };

            this.peerConnection.ontrack = (event) => {
                console.log('[WebRTC] Received remote track:', event.track.kind, event.track.enabled);
                this.remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
                let remoteAudio = document.getElementById('remote-audio');
                if (!remoteAudio) {
                    remoteAudio = document.createElement('audio');
                    remoteAudio.id = 'remote-audio';
                    remoteAudio.autoplay = true;
                    remoteAudio.playsInline = true;
                    document.body.appendChild(remoteAudio);
                }
                remoteAudio.srcObject = this.remoteStream;
                // Explicitly play to handle some browser policies
                remoteAudio.play().catch(err => console.error('Error playing remote audio:', err));
            };
        },
        startCallTimer() {
            this.callStartTime = Date.now();
            this.callTimer = setInterval(() => {
                const now = Date.now();
                const diff = Math.floor((now - this.callStartTime) / 1000);
                this.callDuration = PayambarFuncs.formatRecordingDuration(diff);
            }, 1000);
        },
        stopCallTimer() {
            if (this.callTimer) {
                clearInterval(this.callTimer);
                this.callTimer = null;
            }
            this.callDuration = '';
            this.callStartTime = null;
        },
        saveCallLogMessage(otherUserId, content) {
            // Send a regular message for call history
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'message',
                    receiver_id: otherUserId,
                    content: content
                }));
            }
        },
        async acquireWakeLock() {
            if ('wakeLock' in navigator) {
                try {
                    if (this.wakeLockSentinel) {
                        await this.wakeLockSentinel.release().catch(() => {});
                    }
                    this.wakeLockSentinel = await navigator.wakeLock.request('screen');
                    this.wakeLockSentinel.addEventListener('release', () => {
                        console.log('[WebRTC] Screen wake lock was released');
                    });
                    console.log('[WebRTC] Screen wake lock active (screen will not sleep during call)');
                } catch (err) {
                    console.warn('[WebRTC] Could not acquire screen wake lock:', err);
                }
            }
        },
        releaseWakeLock() {
            if (this.wakeLockSentinel) {
                this.wakeLockSentinel.release().catch(() => {});
                this.wakeLockSentinel = null;
                console.log('[WebRTC] Screen wake lock released');
            }
        },
        setupMediaSession(name) {
            if ('mediaSession' in navigator) {
                try {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: name || 'تماس صوتی',
                        artist: 'Payambar',
                        album: 'تماس صوتی در حال انجام',
                    });
                    navigator.mediaSession.playbackState = 'playing';
                    navigator.mediaSession.setActionHandler('hangup', () => {
                        this.endCall(true);
                    });
                } catch (e) {
                    console.warn('[WebRTC] MediaSession error:', e);
                }
            }
        },
        cleanupMediaSession() {
            if ('mediaSession' in navigator) {
                try {
                    navigator.mediaSession.playbackState = 'none';
                } catch (e) {}
            }
        },
        async dismissCallNotification() {
            try {
                const reg = await navigator.serviceWorker?.ready;
                const notifications = await reg?.getNotifications();
                notifications?.forEach(n => n.tag?.startsWith('incoming-call') && n.close());
            } catch (e) {}
        },
        returnToActiveCallChat() {
            if (!this.activeCall) return;
            const targetUserId = Number(this.activeCall.user_id);
            const targetConv = PayambarConversations.findByUserId(this.conversations, targetUserId) || {
                user_id: targetUserId,
                username: this.activeCall.username,
                display_name: this.activeCall.displayName,
                avatar_url: this.activeCall.avatar_url,
            };
            this.selectConversation(targetConv);
        },
    },
});

app.component('user-search-item', UserSearchItem);
app.mount('#app');
