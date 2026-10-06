import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isDuplicateKey, parseJsonBody, serverError } from "@/lib/http";
import { PushSubscriptionModel } from "@/lib/models/PushSubscription";
import { isPushServiceEndpoint, pushEnabled, vapidPublicKey } from "@/lib/push";
import { rateLimit, type RateLimitRule } from "@/lib/rate-limit";

const PUSH_SUBSCRIPTION_LIMIT: RateLimitRule = { limit: 30, windowSeconds: 60 * 60 };

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2000).refine(isPushServiceEndpoint, "Unsupported push endpoint"),
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
    const limited = await rateLimit("push-subscribe", auth.user._id.toString(), PUSH_SUBSCRIPTION_LIMIT);
    if (limited) return limited;

    const parsed = await parseJsonBody(req, SubscribeSchema);
    if ("error" in parsed) return parsed.error;

    // An endpoint left behind by a previous account on a shared phone moves to this user, but only
    // when the request also carries the stored auth secret. The server can't verify the keys, so
    // knowing someone else's endpoint alone must not be enough to take it over.
    const upsert = () =>
      PushSubscriptionModel.updateOne(
        {
          endpoint: parsed.data.endpoint,
          $or: [{ userId: auth.user._id }, { "keys.auth": parsed.data.keys.auth }],
        },
        {
          $set: {
            userId: auth.user._id,
            keys: parsed.data.keys,
            userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? "",
          },
        },
        { upsert: true }
      );
    try {
      await upsert();
    } catch (error) {
      // Either two simultaneous first subscribes (the retry updates the winner's doc) or the endpoint
      // belongs to another account with a different secret (the retry still fails: conflict).
      if (!isDuplicateKey(error)) throw error;
      try {
        await upsert();
      } catch (retryError) {
        if (!isDuplicateKey(retryError)) throw retryError;
        return NextResponse.json({ error: "Subscription belongs to another account" }, { status: 409 });
      }
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return serverError("POST /api/push/subscribe", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const limited = await rateLimit("push-unsubscribe", auth.user._id.toString(), PUSH_SUBSCRIPTION_LIMIT);
    if (limited) return limited;

    const parsed = await parseJsonBody(req, UnsubscribeSchema);
    if ("error" in parsed) return parsed.error;

    // Scoped to the caller; the response is the same whether or not anything matched, so it never
    // reveals whether another account holds the endpoint.
    await PushSubscriptionModel.deleteOne({ endpoint: parsed.data.endpoint, userId: auth.user._id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/push/subscribe", error);
  }
}
