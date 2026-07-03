export const API_URL =
  typeof window !== "undefined" && (window as Window & { API_URL?: string }).API_URL
    ? (window as Window & { API_URL: string }).API_URL
    : `${window.location.origin}/api`;

export const WS_URL =
  typeof window !== "undefined" && (window as Window & { WS_URL?: string }).WS_URL
    ? (window as Window & { WS_URL: string }).WS_URL
    : `${window.location.origin.replace(/^http/, "ws")}/ws`;

export const NEW_CHAT_SEARCH_DEBOUNCE_MS = 500;
