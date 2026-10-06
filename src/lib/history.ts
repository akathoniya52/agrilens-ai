import type { Content } from "@google/genai";
import type { Diagnosis, MessageRole } from "@/types/chat";

/** Minimum number of recent messages always sent verbatim; older ones are folded into chat.summary. */
export const HISTORY_LIMIT = 10;
/** Hard cap on verbatim history, so a chat whose summary keeps failing can't grow the prompt forever. */
export const HISTORY_MAX = 40;

export interface HistoryMessage {
  role: MessageRole;
  content: string;
  attachments?: { type: string }[];
  diagnosis?: Diagnosis | null;
}

function describeDiagnosis(d: Diagnosis): string {
  const confidence = Math.round((d.confidence ?? 0) * 100);
  return `[Image diagnosis: ${d.crop} — ${d.condition}, severity ${d.severity}, ~${Math.round(d.affectedAreaPct ?? 0)}% affected, confidence ${confidence}%]`;
}

/** Image-only turns have empty content and diagnoses live outside the answer text; spell both out. */
export function historyText(msg: HistoryMessage): string {
  const parts: string[] = [];
  const images = msg.attachments?.length ?? 0;
  if (msg.role === "user" && images) parts.push(`[Sent ${images} crop photo${images > 1 ? "s" : ""}]`);
  if (msg.role === "assistant" && msg.diagnosis) parts.push(describeDiagnosis(msg.diagnosis));
  if (msg.content.trim()) parts.push(msg.content);
  return parts.join("\n");
}

/**
 * Converts the latest messages (queried newest-first) into Gemini history, oldest-first.
 * Drops system/empty messages and any leading model turns so history starts with the user.
 */
export function buildHistory(newestFirst: HistoryMessage[]): Content[] {
  const contents: Content[] = [...newestFirst]
    .reverse()
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({ role: msg.role === "user" ? "user" : "model", text: historyText(msg) }))
    .filter((msg) => msg.text)
    .map(({ role, text }) => ({ role, parts: [{ text }] }));

  const firstUser = contents.findIndex((c) => c.role === "user");
  return firstUser === -1 ? [] : contents.slice(firstUser);
}
