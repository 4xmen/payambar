import type { ChatMessage } from "@/store/types";
import { getMessageFileName } from "@/lib/messageMedia";

export function formatDate(value: string | undefined): string {
  if (!value) return "";
  try {
    if (value === "0001-01-01T00:00:00Z" || value.startsWith("0001-01-01")) {
      return "";
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    if (date.getFullYear() < 2000) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0 || diffMs > 10 * 365 * 24 * 60 * 60 * 1000) {
      return "";
    }
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    const rtf = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });
    if (diffSeconds < 60) return rtf.format(-diffSeconds, "second");
    if (diffMinutes < 60) return rtf.format(-diffMinutes, "minute");
    if (diffHours < 24) return rtf.format(-diffHours, "hour");
    if (diffDays < 7) return rtf.format(-diffDays, "day");
    if (diffWeeks < 4) return rtf.format(-diffWeeks, "week");
    if (diffMonths < 12) return rtf.format(-diffMonths, "month");
    return rtf.format(-diffYears, "year");
  } catch {
    return "";
  }
}

export function formatTime(value: string | undefined): string {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const persianNums = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    const timeStr = `${hours}:${minutes}`;
    return timeStr.replace(/[0-9]/g, (d) => persianNums[parseInt(d, 10)]);
  } catch {
    return "";
  }
}

export function formatStatus(msg: ChatMessage): string {
  if (msg.status === "read") return "✓✓";
  if (msg.status === "delivered") return "✓";
  return "";
}

export function formatRecordingDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function getConversationPreview(
  conv: { last_message_preview?: string; user_id: number },
  messagesByUser: Record<number, ChatMessage[]>
): string {
  if (!conv) return "";
  const localMessages = messagesByUser[conv.user_id] || [];
  const latest = localMessages[localMessages.length - 1];
  if (latest?.file_name) return latest.file_name;
  if (latest?.file_url) return "فایل";
  if (latest?.content) return String(latest.content).trim();
  const p = conv.last_message_preview;
  if (typeof p === "string" && p.trim()) return p.trim();
  return "";
}

export function shouldShowMessageStatus(
  msg: ChatMessage | undefined,
  index: number,
  list: ChatMessage[],
  userId: number | null
): boolean {
  if (!msg) return false;
  if (Number(msg.sender_id) !== Number(userId)) return false;
  for (let i = list.length - 1; i >= 0; i--) {
    if (Number(list[i]?.sender_id) === Number(userId)) {
      return i === index;
    }
  }
  return false;
}

export function parseTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function getConversationLastTimestamp(
  conv: {
    last_message_at?: string;
    user_id: number;
  },
  messagesByUser: Record<number, ChatMessage[]>
): number {
  if (!conv) return 0;
  const fromConversation = parseTimestamp(conv.last_message_at);
  const localMessages = messagesByUser[conv.user_id] || [];
  let localMax = 0;
  for (const msg of localMessages) {
    const ts = parseTimestamp(msg?.created_at);
    if (ts > localMax) localMax = ts;
  }
  return Math.max(fromConversation, localMax);
}

export function getSortedConversations<T extends { user_id: number; last_message_at?: string }>(
  conversations: T[],
  messagesByUser: Record<number, ChatMessage[]>
): T[] {
  return [...conversations].sort(
    (a, b) =>
      getConversationLastTimestamp(b, messagesByUser) - getConversationLastTimestamp(a, messagesByUser)
  );
}
