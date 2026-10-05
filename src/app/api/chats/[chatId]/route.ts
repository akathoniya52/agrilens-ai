import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Chat } from "@/lib/models/Chat";
import { Message } from "@/lib/models/Message";
import { serializeChat } from "@/lib/serialize";

type Params = { params: Promise<{ chatId: string }> };

const UpdateChatSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
});

// Update chat title
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const { chatId } = await params;
    if (!isObjectId(chatId)) return jsonError("Chat not found", 404);

    const parsed = await parseJsonBody(req, UpdateChatSchema);
    if ("error" in parsed) return parsed.error;

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, userId: auth.user._id },
      { title: parsed.data.title },
      { new: true }
    ).lean();
    if (!chat) return jsonError("Chat not found", 404);

    return NextResponse.json(serializeChat(chat));
  } catch (error) {
    return serverError("PATCH /api/chats/[chatId]", error);
  }
}

// Delete chat
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const { chatId } = await params;
    if (!isObjectId(chatId)) return jsonError("Chat not found", 404);

    const chat = await Chat.findOneAndDelete({ _id: chatId, userId: auth.user._id });
    if (!chat) return jsonError("Chat not found", 404);

    // Delete all messages in this chat
    await Message.deleteMany({ chatId: chat._id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/chats/[chatId]", error);
  }
}
