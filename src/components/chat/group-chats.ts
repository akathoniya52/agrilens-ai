import type { ChatSummary } from "@/types/chat";

export type ChatGroupKey = "today" | "yesterday" | "last7Days" | "older";

export type ChatRow = { kind: "header"; key: ChatGroupKey } | { kind: "chat"; chat: ChatSummary };

const DAY_MS = 86_400_000;

export function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function groupOf(timestamp: number, todayStart: number): ChatGroupKey {
  if (timestamp >= todayStart) return "today";
  if (timestamp >= todayStart - DAY_MS) return "yesterday";
  if (timestamp >= todayStart - 7 * DAY_MS) return "last7Days";
  return "older";
}

/** Flattens chats (already sorted newest first) into header + chat rows for a single animated list. */
export function toChatRows(chats: ChatSummary[], todayStart: number): ChatRow[] {
  const rows: ChatRow[] = [];
  let current: ChatGroupKey | null = null;
  for (const chat of chats) {
    const group = groupOf(Date.parse(chat.lastMessageAt), todayStart);
    if (group !== current) {
      rows.push({ kind: "header", key: group });
      current = group;
    }
    rows.push({ kind: "chat", chat });
  }
  return rows;
}
