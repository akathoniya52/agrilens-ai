import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isExpert, serializeCase } from "@/lib/cases";
import { findOwnedChat } from "@/lib/chat-service";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Case } from "@/lib/models/Case";
import { Message } from "@/lib/models/Message";
import { User } from "@/lib/models/User";

const CreateSchema = z.object({
  messageId: z.string().refine(isObjectId, "Invalid message id"),
  note: z.string().trim().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const expert = isExpert(auth.user.email);
    const all = expert && req.nextUrl.searchParams.get("scope") === "all";
    const status = req.nextUrl.searchParams.get("status");

    const filter: Record<string, unknown> = all ? {} : { userId: auth.user._id };
    if (status === "open" || status === "assigned" || status === "resolved") filter.status = status;
    const cases = await Case.find(filter).sort({ createdAt: -1 }).limit(100).lean();

    const owners = all
      ? new Map(
          (await User.find({ _id: { $in: cases.map((c) => c.userId) } }).select("name email").lean()).map((u) => [
            u._id.toString(),
            { name: u.name ?? null, email: u.email },
          ])
        )
      : null;
    return NextResponse.json({
      expert,
      cases: cases.map((c) => serializeCase(c, owners?.get(c.userId.toString()))),
    });
  } catch (error) {
    return serverError("GET /api/cases", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const parsed = await parseJsonBody(req, CreateSchema);
    if ("error" in parsed) return parsed.error;

    const message = await Message.findById(parsed.data.messageId).lean();
    if (!message || message.role !== "assistant") return jsonError("Message not found", 404);
    const chat = await findOwnedChat(message.chatId.toString(), user._id);
    if (!chat) return jsonError("Message not found", 404);

    const existing = await Case.findOne({ messageId: message._id, userId: user._id, status: { $ne: "resolved" } }).lean();
    if (existing) return NextResponse.json(serializeCase(existing));

    const question = await Message.findOne({ chatId: chat._id, role: "user", createdAt: { $lte: message.createdAt } })
      .sort({ createdAt: -1 })
      .lean();
    const diagnosis = message.diagnosis
      ? {
          crop: message.diagnosis.crop,
          condition: message.diagnosis.condition,
          severity: message.diagnosis.severity,
          confidence: message.diagnosis.confidence,
        }
      : null;

    const created = await Case.create({
      userId: user._id,
      chatId: chat._id,
      messageId: message._id,
      snapshot: {
        question: question?.content ?? "",
        answer: message.content,
        imageUrls: (question?.attachments ?? []).filter((a) => a.type.startsWith("image/")).map((a) => a.url),
        diagnosis,
      },
      notes: parsed.data.note ? [{ author: user.name || user.email, role: "farmer", text: parsed.data.note, at: new Date() }] : [],
    });
    return NextResponse.json(serializeCase(created.toObject()), { status: 201 });
  } catch (error) {
    return serverError("POST /api/cases", error);
  }
}
