const FALLBACK_TITLE_LENGTH = 50;
const MAX_TITLE_WORDS = 6;
const MAX_TITLE_CHARS = 60;

export const IMAGE_CHAT_TITLE = "Crop image diagnosis";

export function fallbackTitle(content: string): string {
  const text = content.trim().replace(/\s+/g, " ");
  if (!text) return IMAGE_CHAT_TITLE;
  return text.length > FALLBACK_TITLE_LENGTH
    ? `${text.substring(0, FALLBACK_TITLE_LENGTH)}...`
    : text;
}

export function cleanTitle(raw: string | null | undefined): string | null {
  const firstLine = (raw ?? "").split("\n").find((line) => line.trim()) ?? "";
  const title = firstLine
    .replace(/^["'`*#\s]+|["'`*.\s]+$/g, "")
    .replace(/^title:\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS)
    .join(" ")
    .slice(0, MAX_TITLE_CHARS)
    .trim();
  return title || null;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
