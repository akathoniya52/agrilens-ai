import { NextResponse } from "next/server";
import { isDuplicateKey } from "./http";
import { connectDB } from "./mongodb";
import { RateLimit } from "./models/RateLimit";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  chatMessage: { limit: 30, windowSeconds: 60 },
  upload: { limit: 60, windowSeconds: 60 * 60 },
  transcribe: { limit: 30, windowSeconds: 10 * 60 },
  ndvi: { limit: 30, windowSeconds: 60 * 60 },
  market: { limit: 60, windowSeconds: 60 * 60 },
  outbreaks: { limit: 60, windowSeconds: 60 * 60 },
  phoneLink: { limit: 10, windowSeconds: 60 * 60 },
  iotIngest: { limit: 240, windowSeconds: 60 * 60 },
  caseCreate: { limit: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter shared by all serverless instances (MongoDB, TTL-expired). Returns a 429
 * response when `subject` exceeded the rule for `bucket`, otherwise null. Fails open on DB errors so
 * a limiter outage never takes the API down with it.
 */
export async function rateLimit(bucket: string, subject: string, rule: RateLimitRule): Promise<NextResponse | null> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `${bucket}:${subject}:${windowStart}`;
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } };

  try {
    await connectDB();
    let doc;
    try {
      doc = await RateLimit.findOneAndUpdate({ key }, update, { upsert: true, new: true }).lean();
    } catch (error) {
      // Two concurrent first hits can both try to insert; the loser just increments the winner's doc.
      if (!isDuplicateKey(error)) throw error;
      doc = await RateLimit.findOneAndUpdate({ key }, update, { new: true }).lean();
    }
    if (doc && doc.count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    return null;
  } catch (error) {
    console.error(`Rate limiter failed (${bucket}):`, error);
    return null;
  }
}
