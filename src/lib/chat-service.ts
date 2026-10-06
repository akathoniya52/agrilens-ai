import type { Types } from "mongoose";
import type { Content } from "@google/genai";
import { Chat, type ChatDoc } from "@/lib/models/Chat";
import { Message, type MessageDoc } from "@/lib/models/Message";
import { HISTORY_LIMIT, HISTORY_MAX, buildHistory, historyText } from "@/lib/history";
import { summarizeConversation } from "@/lib/gemini";
import type { ContextSection } from "@/lib/prompts";

/** Unsummarized messages allowed before the oldest ones are folded into chat.summary. */
export const SUMMARY_TRIGGER = 20;

const HISTORY_FIELDS = "role content attachments.type diagnosis createdAt";

function unsummarized(chat: ChatDoc) {
  return chat.summarizedUpTo ? { $gt: chat.summarizedUpTo } : undefined;
}

export async function findOwnedChat(chatId: string, userId: Types.ObjectId): Promise<ChatDoc | null> {
  return Chat.findOne({ _id: chatId, userId });
}

/**
 * Every message after chat.summarizedUpTo and before (excluding) the given user message, oldest-first.
 * Summary + history therefore always cover the whole chat: there is no window of messages that is
 * neither summarized nor sent verbatim.
 */
export async function loadHistory(userMsg: MessageDoc, chat: ChatDoc): Promise<Content[]> {
  const latest = await Message.find({
    chatId: userMsg.chatId,
    _id: { $ne: userMsg._id },
    createdAt: { $lte: userMsg.createdAt, ...unsummarized(chat) },
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_MAX)
    .select(HISTORY_FIELDS)
    .lean();
  return buildHistory(latest);
}

export function summaryContext(chat: ChatDoc): ContextSection[] {
  return chat.summary
    ? [{ label: "Summary of earlier conversation", content: chat.summary }]
    : [];
}

/**
 * Rolling summary: once more than SUMMARY_TRIGGER messages are unsummarized, fold all but the latest
 * HISTORY_LIMIT of them into chat.summary. Persists itself (guarded against concurrent turns) so a
 * result that lands after the caller's chat.save() is not lost; also updates `chat` in memory.
 */
export async function updateRollingSummary(chat: ChatDoc, language: string): Promise<boolean> {
  const after = unsummarized(chat);
  const scope = { chatId: chat._id, ...(after && { createdAt: after }) };
  const total = await Message.countDocuments(scope);
  if (total <= SUMMARY_TRIGGER) return false;

  const pending = await Message.find(scope)
    .sort({ createdAt: -1 })
    .skip(HISTORY_LIMIT)
    .select(HISTORY_FIELDS)
    .lean();
  if (!pending.length) return false;
  pending.reverse();

  const transcript = pending
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, text: historyText(m) }))
    .filter((m) => m.text)
    .map((m) => `${m.role === "user" ? "Farmer" : "AgriLens"}: ${m.text.slice(0, 1500)}`)
    .join("\n");
  const summary = await summarizeConversation({
    previousSummary: chat.summary,
    transcript,
    language,
  });
  if (!summary) return false;

  const summarizedUpTo = pending[pending.length - 1].createdAt;
  const result = await Chat.updateOne(
    { _id: chat._id, summarizedUpTo: chat.summarizedUpTo ?? null },
    { $set: { summary, summarizedUpTo } }
  );
  if (result.modifiedCount === 0) return false;

  chat.summary = summary;
  chat.summarizedUpTo = summarizedUpTo;
  return true;
}
