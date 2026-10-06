import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAnswerStream, runAnswer, type AnswerTurn } from "@/lib/answer";
import { acquireGenerationLock, findOwnedChat, releaseGenerationLock } from "@/lib/chat-service";
import { consumeCredits, refundCredits } from "@/lib/credits";
import {
  exceedsContentLength,
  isDuplicateKey,
  isObjectId,
  jsonError,
  parseJsonBody,
  serverError,
} from "@/lib/http";
import {
  MAX_IMAGE_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
  inlineAttachmentBytes,
  isAllowedImageType,
  isTrustedImageUrl,
} from "@/lib/media";
import { DEFAULT_CHAT_TITLE, type ChatDoc } from "@/lib/models/Chat";
import { Message, type MessageDoc } from "@/lib/models/Message";
import type { UserDoc } from "@/lib/models/User";
import { serializeMessage } from "@/lib/serialize";
import { NDJSON_HEADERS } from "@/lib/stream";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import type { ChatMessage } from "@/types/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ chatId: string }> };

/** Inline data URLs are dev-only (rejected in production), so production bodies are small. */
const MAX_BODY_BYTES = process.env.NODE_ENV === "production" ? 64 * 1024 : 12 * 1024 * 1024;
const MAX_ATTACHMENT_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const AttachmentSchema = z.object({
  url: z.string().min(1).max(MAX_ATTACHMENT_URL_LENGTH),
  type: z.string().refine(isAllowedImageType, "Unsupported attachment type"),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});

const PostSchema = z
  .object({
    content: z.string().max(8000).default(""),
    attachments: z.array(AttachmentSchema).max(4).default([]),
    regenerate: z.boolean().default(false),
    clientId: z.string().uuid().optional(),
  })
  .refine((b) => b.regenerate || b.content.trim() || b.attachments.length > 0, {
    message: "Content required",
    path: ["content"],
  });

type PostBody = z.infer<typeof PostSchema>;

function pageSize(value: string | null): number {
  const parsed = value === null ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsed)) : DEFAULT_PAGE_SIZE;
}

/** Newest `limit` messages older than `?before=<messageId>` (or the newest overall), returned oldest→newest. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const { chatId } = await params;
    if (!isObjectId(chatId)) return jsonError("Chat not found", 404);

    const limit = pageSize(req.nextUrl.searchParams.get("limit"));
    const before = req.nextUrl.searchParams.get("before");
    if (before !== null && !isObjectId(before)) return jsonError("Invalid before cursor", 400);

    const chat = await findOwnedChat(chatId, auth.user._id);
    if (!chat) return jsonError("Chat not found", 404);

    let filter: Record<string, unknown> = { chatId: chat._id };
    if (before !== null) {
      const cursor = await Message.findOne({ _id: before, chatId: chat._id }).select("_id createdAt").lean();
      if (!cursor) return jsonError("Invalid before cursor", 400);
      filter = {
        chatId: chat._id,
        $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }],
      };
    }

    const messages = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return Response.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    return serverError("GET /api/chats/[chatId]/messages", error);
  }
}

/** The old answers stay until the new one is saved; runAnswer deletes `replaceIds` afterwards. */
async function prepareRegenerate(chat: ChatDoc): Promise<{ userMsg: MessageDoc; replaceIds: string[] } | null> {
  const userMsg = await Message.findOne({ chatId: chat._id, role: "user" }).sort({ createdAt: -1 });
  if (!userMsg) return null;
  const previous = await Message.find({ chatId: chat._id, role: "assistant", createdAt: { $gte: userMsg.createdAt } })
    .select("_id")
    .lean();
  return { userMsg, replaceIds: previous.map((m) => m._id.toString()) };
}

type Duplicate = { duplicateOf: string };

/** A resent `clientId`: its saved answers (200), or 409 `unanswered` so the user can tap Regenerate. */
async function duplicateResponse(chat: ChatDoc, clientId: string): Promise<Response> {
  const userMsg = await Message.findOne({ chatId: chat._id, clientId, role: "user" }).lean();
  if (!userMsg) return jsonError("Message already received", 409);
  const later = await Message.find({ chatId: chat._id, createdAt: { $gte: userMsg.createdAt }, _id: { $ne: userMsg._id } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(20)
    .lean();
  const nextUser = later.findIndex((m) => m.role === "user");
  const answers = (nextUser === -1 ? later : later.slice(0, nextUser)).filter((m) => m.role === "assistant");
  if (!answers.length) {
    return NextResponse.json({ error: "Message already received but not answered yet", code: "unanswered" }, { status: 409 });
  }
  const messages: ChatMessage[] = [userMsg, ...answers].map(serializeMessage);
  return NextResponse.json({ status: "answered", messages });
}

async function prepareTurn(
  user: UserDoc,
  chat: ChatDoc,
  body: PostBody,
  credits: number
): Promise<AnswerTurn | Duplicate | null> {
  if (body.regenerate) {
    const prepared = await prepareRegenerate(chat);
    if (!prepared) return null;
    return {
      user,
      chat,
      userMsg: prepared.userMsg,
      credits,
      isFirstMessage: chat.title === DEFAULT_CHAT_TITLE,
      replaceIds: prepared.replaceIds,
    };
  }

  const priorCount = await Message.countDocuments({ chatId: chat._id });
  const userMsg = await Message.create({
    chatId: chat._id,
    userId: user._id,
    role: "user",
    content: body.content.trim(),
    attachments: body.attachments,
    ...(body.clientId && { clientId: body.clientId }),
  }).catch((error: unknown) => {
    if (isDuplicateKey(error)) return null;
    throw error;
  });
  if (!userMsg) return { duplicateOf: body.clientId ?? "" };
  chat.lastMessageAt = new Date();
  await chat.save();
  return {
    user,
    chat,
    userMsg,
    credits,
    isFirstMessage: priorCount === 0 && chat.title === DEFAULT_CHAT_TITLE,
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const limited = await rateLimit("chat-message", auth.user._id.toString(), RATE_LIMITS.chatMessage);
    if (limited) return limited;
    const { user } = auth;

    const { chatId } = await params;
    if (!isObjectId(chatId)) return jsonError("Chat not found", 404);

    if (exceedsContentLength(req, MAX_BODY_BYTES)) return jsonError("Message is too large", 413);
    const parsed = await parseJsonBody(req, PostSchema, MAX_BODY_BYTES);
    if ("error" in parsed) return parsed.error;

    if (!parsed.data.attachments.every((a) => isTrustedImageUrl(a.url, user._id.toString()))) {
      return jsonError("attachments: Unsupported attachment URL", 400);
    }
    if (inlineAttachmentBytes(parsed.data.attachments) > MAX_INLINE_ATTACHMENT_BYTES) {
      return jsonError("attachments: Images are too large", 413);
    }

    const chat = await findOwnedChat(chatId, user._id);
    if (!chat) return jsonError("Chat not found", 404);

    const lock = await acquireGenerationLock(chat._id, user._id);
    if (!lock) {
      return NextResponse.json({ error: "An answer is already being generated in this chat.", code: "busy" }, { status: 409 });
    }
    const release = () => releaseGenerationLock(lock).catch((error: unknown) => console.error("AgriLens lock release failed:", error));
    let handedOff = false;
    try {
      const credits = await consumeCredits(user._id);
      if (credits === null) {
        return jsonError("You have run out of credits.", 402);
      }

      let turn: AnswerTurn | Duplicate | null;
      try {
        turn = await prepareTurn(user, chat, parsed.data, credits);
      } catch (error) {
        await refundCredits(user._id);
        throw error;
      }
      if (!turn) {
        await refundCredits(user._id);
        return jsonError("Nothing to regenerate", 400);
      }
      if ("duplicateOf" in turn) {
        await refundCredits(user._id);
        return await duplicateResponse(chat, turn.duplicateOf);
      }

      const answerTurn = turn;
      const stream = createAnswerStream(async (send, signal) => {
        try {
          return await runAnswer(answerTurn, send, signal);
        } finally {
          await release();
        }
      }, req.signal);
      handedOff = true;
      return new Response(stream, { headers: NDJSON_HEADERS });
    } finally {
      if (!handedOff) await release();
    }
  } catch (error) {
    return serverError("POST /api/chats/[chatId]/messages", error);
  }
}
