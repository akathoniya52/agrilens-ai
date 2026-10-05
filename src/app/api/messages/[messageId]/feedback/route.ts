import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Chat } from "@/lib/models/Chat";
import { Message } from "@/lib/models/Message";
import { serializeMessage } from "@/lib/serialize";

type Params = { params: Promise<{ messageId: string }> };

const FeedbackSchema = z.object({
  feedback: z.enum(["up", "down"]).nullable(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const { messageId } = await params;
    if (!isObjectId(messageId)) return jsonError("Message not found", 404);

    const parsed = await parseJsonBody(req, FeedbackSchema);
    if ("error" in parsed) return parsed.error;

    const message = await Message.findById(messageId);
    if (!message) return jsonError("Message not found", 404);

    const ownsChat = await Chat.exists({ _id: message.chatId, userId: auth.user._id });
    if (!ownsChat) return jsonError("Message not found", 404);

    message.feedback = parsed.data.feedback;
    await message.save();
    return NextResponse.json(serializeMessage(message));
  } catch (error) {
    return serverError("PATCH /api/messages/[messageId]/feedback", error);
  }
}
