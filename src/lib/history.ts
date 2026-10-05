import type { Content } from "@google/genai";
import type { MessageRole } from "@/types/chat";

export const HISTORY_LIMIT = 10;

export interface HistoryMessage {
  role: MessageRole;
  content: string;
}

/**
 * Converts the latest messages (queried newest-first) into Gemini history, oldest-first.
 * Drops system/empty messages and any leading model turns so history starts with the user.
 */
export function buildHistory(newestFirst: HistoryMessage[]): Content[] {
  const contents: Content[] = [...newestFirst]
    .reverse()
    .filter((msg) => msg.role !== "system" && msg.content.trim())
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

  const firstUser = contents.findIndex((c) => c.role === "user");
  return firstUser === -1 ? [] : contents.slice(firstUser);
}
