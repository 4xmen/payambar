import { computed, reactive, ref } from 'vue';
import type { SessionData } from '../types';
import { API_URL, authHeaders } from '../services/api';
import {
  clearSession,
  loadStoredSession,
  login,
  persistSession,
  register,
  validateRegister,
} from '../services/auth';

const initialSession = typeof window !== 'undefined' ? loadStoredSession() : null;

const token = ref<string | null>(initialSession?.token || null);
const userId = ref<number | null>(initialSession?.userId || null);
const username = ref<string | null>(initialSession?.username || null);
const profileDisplayName = ref<string>(initialSession?.displayName || '');
const myAvatarUrl = ref<string | null>(null);
const authPassword = ref<string>('');
const suppressBackupWarningOnce = ref<boolean>(false);

const authTab = ref<'login' | 'register'>('login');
const authError = ref<string>('');
const acceptRules = ref<boolean>(false);
const showRulesModal = ref<boolean>(false);

const loginForm = reactive({
  username: '',
  password: '',
});

const registerForm = reactive({
  username: '',
  password: '',
  confirm: '',
});

const isAuthed = computed(() => Boolean(token.value && userId.value && userId.value > 0));

export function useAuth() {
  function initAuth(): SessionData | null {
    const session = loadStoredSession();
    if (session) {
      token.value = session.token;
      userId.value = session.userId;
      username.value = session.username;
      profileDisplayName.value = session.displayName || '';
      return session;
    } else {
      clearAuth();
      return null;
    }
  }

  function setAuth(data: { token: string; user_id: number; username: string; display_name?: string }): void {
    token.value = data.token;
    userId.value = Number(data.user_id);
    username.value = data.username;
    if (data.display_name) {
      profileDisplayName.value = data.display_name;
    }
    persistSession(undefined, {
      token: data.token,
      userId: Number(data.user_id),
      username: data.username,
      displayName: profileDisplayName.value,
    });
  }

  function clearAuth(): void {
    token.value = null;
    userId.value = null;
    username.value = null;
    profileDisplayName.value = '';
    myAvatarUrl.value = null;
    authPassword.value = '';
    acceptRules.value = false;
    clearSession();
  }

  async function handleLogin(): Promise<boolean> {
    authError.value = '';
    try {
      const data = await login(API_URL, {
        username: loginForm.username,
        password: loginForm.password,
      });
      authPassword.value = loginForm.password;
      suppressBackupWarningOnce.value = false;
      setAuth(data);
      return true;
    } catch (err: any) {
      authError.value = err.message || 'Login failed';
      return false;
    }
  }

  async function handleRegister(): Promise<boolean> {
    authError.value = '';
    const validation = validateRegister({
      acceptRules: acceptRules.value,
      password: registerForm.password,
      confirm: registerForm.confirm,
    });
    if (!validation.ok) {
      authError.value = validation.error;
      return false;
    }
    try {
      const data = await register(API_URL, {
        username: registerForm.username,
        password: registerForm.password,
      });
      authPassword.value = registerForm.password;
      suppressBackupWarningOnce.value = true;
      setAuth(data);
      return true;
    } catch (err: any) {
      authError.value = err.message || 'Register failed';
      return false;
    }
  }

  async function loadMyProfile(): Promise<void> {
    if (!token.value) return;
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: authHeaders(token.value),
      });
      if (res.status === 401) {
        clearAuth();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        profileDisplayName.value = data.display_name || '';
        myAvatarUrl.value = data.avatar_url || null;
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }

  async function saveProfile(displayName: string): Promise<boolean> {
    if (!token.value) return false;
    const res = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token.value),
      },
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!res.ok) throw new Error('Failed to save profile');
    profileDisplayName.value = displayName;
    persistSession(undefined, {
      token: token.value,
      userId: userId.value!,
      username: username.value!,
      displayName,
    });
    return true;
  }

  async function uploadAvatar(file: File): Promise<string> {
    if (!token.value) throw new Error('Not authenticated');
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch(`${API_URL}/profile/avatar`, {
      method: 'POST',
      headers: authHeaders(token.value),
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    myAvatarUrl.value = data.avatar_url;
    return data.avatar_url;
  }

  async function deleteAccount(confirmUsername: string): Promise<boolean> {
    if (!token.value || !username.value || confirmUsername.trim() !== username.value) {
      throw new Error('نام کاربری وارد شده صحیح نیست');
    }
    const res = await fetch(`${API_URL}/profile`, {
      method: 'DELETE',
      headers: authHeaders(token.value),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Delete failed');
    }
    clearAuth();
    return true;
  }

  return {
    token,
    userId,
    username,
    profileDisplayName,
    myAvatarUrl,
    authPassword,
    suppressBackupWarningOnce,
    authTab,
    authError,
    acceptRules,
    showRulesModal,
    loginForm,
    registerForm,
    isAuthed,
    initAuth,
    setAuth,
    clearAuth,
    handleLogin,
    handleRegister,
    loadMyProfile,
    saveProfile,
    uploadAvatar,
    deleteAccount,
  };
}
