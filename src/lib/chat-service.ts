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

/** A lock older than this is treated as abandoned (the function limit is 60 s). */
export const GENERATION_LOCK_MS = 90_000;

export interface GenerationLock {
  chatId: Types.ObjectId;
  token: Date;
}

/**
 * Atomically marks the user's chat as generating so two answers can't run (and be charged) at once.
 * Returns null when another answer in this chat is still in progress.
 */
export async function acquireGenerationLock(chatId: Types.ObjectId, userId: Types.ObjectId): Promise<GenerationLock | null> {
  const token = new Date();
  const staleBefore = new Date(token.getTime() - GENERATION_LOCK_MS);
  const locked = await Chat.findOneAndUpdate(
    {
      _id: chatId,
      userId,
      $or: [{ generatingAt: null }, { generatingAt: { $exists: false } }, { generatingAt: { $lt: staleBefore } }],
    },
    { $set: { generatingAt: token } },
    { projection: { _id: 1 } }
  ).lean();
  return locked ? { chatId, token } : null;
}

/** Releases only our own lock, never one taken over after it went stale. */
export async function releaseGenerationLock(lock: GenerationLock): Promise<void> {
  await Chat.updateOne({ _id: lock.chatId, generatingAt: lock.token }, { $set: { generatingAt: null } });
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
