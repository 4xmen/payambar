import type { ChatMessage } from "@/store/types";

export function getMessageFileName(msg: ChatMessage | undefined): string {
  const fromName = (msg?.file_name || "").toLowerCase();
  if (fromName) return fromName;
  try {
    const url = String(msg?.file_url || "").split("?")[0];
    return url.toLowerCase();
  } catch {
    return "";
  }
}

export function isAudioMessage(msg: ChatMessage | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  const fileName = getMessageFileName(msg);
  if (fileName.startsWith("voice-")) return true;
  const contentType = typeof msg.file_content_type === "string" ? msg.file_content_type.toLowerCase() : "";
  if (contentType.startsWith("audio/")) return true;
  return (
    fileName.endsWith(".webm") ||
    fileName.endsWith(".ogg") ||
    fileName.endsWith(".mp3") ||
    fileName.endsWith(".wav") ||
    fileName.endsWith(".m4a")
  );
}

export function isImageMessage(msg: ChatMessage | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  const contentType = typeof msg.file_content_type === "string" ? msg.file_content_type.toLowerCase() : "";
  if (contentType.startsWith("image/")) return true;
  const fileName = getMessageFileName(msg);
  return (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".bmp") ||
    fileName.endsWith(".svg")
  );
}

export function isVideoMessage(msg: ChatMessage | undefined): boolean {
  if (!msg || !msg.file_url) return false;
  if (isAudioMessage(msg)) return false;
  const contentType = typeof msg.file_content_type === "string" ? msg.file_content_type.toLowerCase() : "";
  if (contentType.startsWith("video/")) return true;
  const fileName = getMessageFileName(msg);
  return (
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".webm") ||
    fileName.endsWith(".mov") ||
    fileName.endsWith(".mkv") ||
    fileName.endsWith(".m4v")
  );
}
