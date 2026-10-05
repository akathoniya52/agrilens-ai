import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { serverError } from "@/lib/http";
import { Chat, DEFAULT_CHAT_TITLE } from "@/lib/models/Chat";
import { serializeChat } from "@/lib/serialize";
import { escapeRegex } from "@/lib/text";

const MAX_CHATS = 200;

const CreateChatSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
    const filter = q
      ? { userId: auth.user._id, title: { $regex: escapeRegex(q), $options: "i" } }
      : { userId: auth.user._id };

    const chats = await Chat.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(MAX_CHATS)
      .select("title lastMessageAt createdAt")
      .lean();
    return NextResponse.json(chats.map(serializeChat));
  } catch (error) {
    return serverError("GET /api/chats", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const raw: unknown = await req.json().catch(() => ({}));
    const parsed = CreateChatSchema.safeParse(raw ?? {});
    const title = (parsed.success && parsed.data.title) || DEFAULT_CHAT_TITLE;

    const chat = await Chat.create({ userId: auth.user._id, title });
    return NextResponse.json(serializeChat(chat), { status: 201 });
  } catch (error) {
    return serverError("POST /api/chats", error);
  }
}
