import type { Types } from "mongoose";
import type { Content } from "@google/genai";
import { Chat, type ChatDoc } from "@/lib/models/Chat";
import { Message, type MessageDoc } from "@/lib/models/Message";
import { HISTORY_LIMIT, buildHistory } from "@/lib/history";
import { summarizeConversation } from "@/lib/gemini";
import type { ContextSection } from "@/lib/prompts";

export const SUMMARY_TRIGGER = 20;
export const SUMMARY_MIN_BATCH = 6;

export async function findOwnedChat(chatId: string, userId: Types.ObjectId): Promise<ChatDoc | null> {
  return Chat.findOne({ _id: chatId, userId });
}

/** Latest HISTORY_LIMIT messages before (and excluding) the given user message, oldest-first. */
export async function loadHistory(userMsg: MessageDoc): Promise<Content[]> {
  const latest = await Message.find({
    chatId: userMsg.chatId,
    _id: { $ne: userMsg._id },
    createdAt: { $lte: userMsg.createdAt },
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("role content")
    .lean();
  return buildHistory(latest);
}

export function summaryContext(chat: ChatDoc): ContextSection[] {
  return chat.summary
    ? [{ label: "Summary of earlier conversation", content: chat.summary }]
    : [];
}

/**
 * Rolling summary: once a chat exceeds SUMMARY_TRIGGER messages, fold everything older than the
 * latest HISTORY_LIMIT messages (and newer than summarizedUpTo) into chat.summary.
 * Mutates `chat` in memory; caller saves it.
 */
export async function updateRollingSummary(chat: ChatDoc, language: string): Promise<boolean> {
  const total = await Message.countDocuments({ chatId: chat._id });
  if (total <= SUMMARY_TRIGGER) return false;

  const boundary = await Message.find({ chatId: chat._id })
    .sort({ createdAt: -1 })
    .skip(HISTORY_LIMIT - 1)
    .limit(1)
    .select("createdAt")
    .lean();
  const cutoff = boundary[0]?.createdAt;
  if (!cutoff) return false;

  const createdAt: { $lt: Date; $gt?: Date } = { $lt: cutoff };
  if (chat.summarizedUpTo) createdAt.$gt = chat.summarizedUpTo;

  const pending = await Message.find({ chatId: chat._id, createdAt })
    .sort({ createdAt: 1 })
    .select("role content createdAt")
    .lean();
  if (pending.length < SUMMARY_MIN_BATCH) return false;

  const transcript = pending
    .filter((m) => m.role !== "system" && m.content)
    .map((m) => `${m.role === "user" ? "Farmer" : "AgriLens"}: ${m.content.slice(0, 1500)}`)
    .join("\n");
  const summary = await summarizeConversation({
    previousSummary: chat.summary,
    transcript,
    language,
  });
  if (!summary) return false;

  chat.summary = summary;
  chat.summarizedUpTo = pending[pending.length - 1].createdAt;
  return true;
}
