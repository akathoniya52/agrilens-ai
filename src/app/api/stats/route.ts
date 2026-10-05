import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { serverError } from "@/lib/http";
import { Chat } from "@/lib/models/Chat";
import { Message } from "@/lib/models/Message";

interface MessageStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  diagnoses: number;
  lastActiveAt: Date | null;
}

const countWhere = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

export async function GET() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const chatIds = await Chat.find({ userId: user._id }).distinct("_id");
    const [stats] = await Message.aggregate<MessageStats>([
      { $match: { chatId: { $in: chatIds } } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          userMessages: countWhere({ $eq: ["$role", "user"] }),
          assistantMessages: countWhere({ $eq: ["$role", "assistant"] }),
          diagnoses: countWhere({ $gt: [{ $ifNull: ["$diagnosis", null] }, null] }),
          lastActiveAt: { $max: "$createdAt" },
        },
      },
    ]);

    return NextResponse.json({
      totalChats: chatIds.length,
      totalMessages: stats?.totalMessages ?? 0,
      userMessages: stats?.userMessages ?? 0,
      assistantMessages: stats?.assistantMessages ?? 0,
      diagnoses: stats?.diagnoses ?? 0,
      credits: user.credits,
      memberSince: user.createdAt.toISOString(),
      lastActiveAt: stats?.lastActiveAt ? new Date(stats.lastActiveAt).toISOString() : null,
    });
  } catch (error) {
    return serverError("GET /api/stats", error);
  }
}
