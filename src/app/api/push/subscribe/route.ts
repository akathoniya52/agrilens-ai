import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseJsonBody, serverError } from "@/lib/http";
import { PushSubscriptionModel } from "@/lib/models/PushSubscription";
import { pushEnabled, vapidPublicKey } from "@/lib/push";

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

export async function GET() {
  return NextResponse.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? vapidPublicKey() : null });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const parsed = await parseJsonBody(req, SubscribeSchema);
    if ("error" in parsed) return parsed.error;

    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint: parsed.data.endpoint },
      {
        $set: {
          userId: auth.user._id,
          keys: parsed.data.keys,
          userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? "",
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return serverError("POST /api/push/subscribe", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const parsed = await parseJsonBody(req, UnsubscribeSchema);
    if ("error" in parsed) return parsed.error;

    await PushSubscriptionModel.deleteOne({ endpoint: parsed.data.endpoint, userId: auth.user._id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/push/subscribe", error);
  }
}
