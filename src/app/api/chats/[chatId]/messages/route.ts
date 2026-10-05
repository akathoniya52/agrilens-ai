import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAnswerStream, runAnswer, type AnswerTurn } from "@/lib/answer";
import { findOwnedChat } from "@/lib/chat-service";
import { consumeCredits, refundCredits } from "@/lib/credits";
import { isDuplicateKey, isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { isAllowedImageType, isTrustedImageUrl } from "@/lib/media";
import { DEFAULT_CHAT_TITLE, type ChatDoc } from "@/lib/models/Chat";
import { Message, type MessageDoc } from "@/lib/models/Message";
import type { UserDoc } from "@/lib/models/User";
import { serializeMessage } from "@/lib/serialize";
import { NDJSON_HEADERS } from "@/lib/stream";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ chatId: string }> };

const AttachmentSchema = z.object({
  url: z.string().min(1).max(7_200_000),
  type: z.string().refine(isAllowedImageType, "Unsupported attachment type"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
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

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const { chatId } = await params;
    if (!isObjectId(chatId)) return jsonError("Chat not found", 404);

    const chat = await findOwnedChat(chatId, auth.user._id);
    if (!chat) return jsonError("Chat not found", 404);

    const messages = await Message.find({ chatId: chat._id }).sort({ createdAt: 1 }).lean();
    return Response.json(messages.map(serializeMessage));
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

const DUPLICATE = "duplicate" as const;

async function prepareTurn(
  user: UserDoc,
  chat: ChatDoc,
  body: PostBody,
  credits: number
): Promise<AnswerTurn | typeof DUPLICATE | null> {
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
  if (!userMsg) return DUPLICATE;
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

    const parsed = await parseJsonBody(req, PostSchema);
    if ("error" in parsed) return parsed.error;

    if (!parsed.data.attachments.every((a) => isTrustedImageUrl(a.url, user._id.toString()))) {
      return jsonError("attachments: Unsupported attachment URL", 400);
    }

    const chat = await findOwnedChat(chatId, user._id);
    if (!chat) return jsonError("Chat not found", 404);

    const credits = await consumeCredits(user._id);
    if (credits === null) {
      return jsonError("You have run out of credits.", 402);
    }

    let turn: AnswerTurn | typeof DUPLICATE | null;
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
    if (turn === DUPLICATE) {
      await refundCredits(user._id);
      return jsonError("Message already received", 409);
    }

    const answerTurn = turn;
    const stream = createAnswerStream((send, signal) => runAnswer(answerTurn, send, signal), req.signal);
    return new Response(stream, { headers: NDJSON_HEADERS });
  } catch (error) {
    return serverError("POST /api/chats/[chatId]/messages", error);
  }
}
