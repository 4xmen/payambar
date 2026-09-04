import { computed, ref } from 'vue';

export type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_STORAGE_KEY = 'payambar_theme_pref';

function getStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const val = localStorage.getItem(THEME_STORAGE_KEY);
  if (val === 'light' || val === 'dark' || val === 'auto') {
    return val;
  }
  return 'auto';
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const preference = ref<ThemePreference>(getStoredPreference());
const systemDark = ref<boolean>(getSystemPrefersDark());

export const isDark = computed<boolean>(() => {
  if (preference.value === 'dark') return true;
  if (preference.value === 'light') return false;
  return systemDark.value;
});

export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const dark = isDark.value;
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', dark ? '#0f1115' : '#ffffff');
  }
}

export function setTheme(pref: ThemePreference): void {
  preference.value = pref;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  }
  applyTheme();
}

export function toggleTheme(): void {
  setTheme(isDark.value ? 'light' : 'dark');
}

// Watch system changes
if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
    if (preference.value === 'auto') {
      applyTheme();
    }
  };

  if (media.addEventListener) {
    media.addEventListener('change', listener);
  } else if ('addListener' in media) {
    (media as any).addListener(listener);
  }

  // Apply immediately on load
  applyTheme();
}

export function useTheme() {
  return {
    preference,
    isDark,
    setTheme,
    toggleTheme,
    applyTheme,
  };
}
