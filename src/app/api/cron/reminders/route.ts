import { NextRequest, NextResponse } from "next/server";
import { jsonError, serverError } from "@/lib/http";
import { connectDB } from "@/lib/mongodb";
import { Farm } from "@/lib/models/Farm";
import { Reminder } from "@/lib/models/Reminder";
import { User } from "@/lib/models/User";
import { pushEnabled, sendPushToUser } from "@/lib/push";
import { getWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily cron runs once, so notify everything due within the next 24h. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDERS = 500;
const MAX_WEATHER_FARMS = 100;
const PUSH_CONCURRENCY = 8;

/** Runs `task` over `items` with at most `limit` in flight; returns the summed results. */
async function sumWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<number>): Promise<number> {
  let next = 0;
  let total = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      total += await task(item).catch((error: unknown) => {
        console.error("Cron notification failed:", error);
        return 0;
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return total;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function notifyReminders(now: Date) {
  const due = await Reminder.find({ done: false, notifiedAt: null, dueAt: { $lte: new Date(now.getTime() + LOOKAHEAD_MS) } })
    .sort({ dueAt: 1 })
    .limit(MAX_REMINDERS)
    .lean();
  const userIds = [...new Set(due.map((r) => r.userId.toString()))];
  const optedOut = new Set(
    (await User.find({ _id: { $in: userIds }, "notificationPrefs.reminders": false }).select("_id").lean()).map((u) =>
      u._id.toString()
    )
  );

  // Claim each reminder atomically so overlapping cron runs never notify twice.
  const sent = await sumWithConcurrency(due, PUSH_CONCURRENCY, async (candidate) => {
    const reminder = await Reminder.findOneAndUpdate(
      { _id: candidate._id, notifiedAt: null },
      { $set: { notifiedAt: now } },
      { new: true }
    ).lean();
    if (!reminder || optedOut.has(reminder.userId.toString())) return 0;
    const url = reminder.farmId ? `/farms/${reminder.farmId.toString()}` : "/farms";
    return sendPushToUser(reminder.userId, {
      title: reminder.title,
      body: `Due ${reminder.dueAt.toISOString().slice(0, 10)}`,
      url,
      tag: `reminder-${reminder._id.toString()}`,
    });
  });
  return { due: due.length, sent };
}

async function notifyWeather() {
  const users = await User.find({ activeFarmId: { $ne: null }, "notificationPrefs.weatherAlerts": { $ne: false } })
    .select("_id activeFarmId")
    .limit(MAX_WEATHER_FARMS)
    .lean();
  const weatherByFarm = new Map<string, ReturnType<typeof getWeather>>();
  const alerts = await sumWithConcurrency(users, PUSH_CONCURRENCY, async (user) => {
    const farm = await Farm.findOne({ _id: user.activeFarmId, userId: user._id }).select("name location").lean();
    if (!farm?.location) return 0;
    const [lon, lat] = farm.location.coordinates;
    const farmKey = farm._id.toString();
    let weather = weatherByFarm.get(farmKey);
    if (!weather) {
      weather = getWeather(lat, lon);
      weatherByFarm.set(farmKey, weather);
    }
    const report = await weather.catch((error: unknown) => {
      console.error("Cron weather lookup failed:", error);
      return null;
    });
    if (report?.risk.level !== "high") return 0;
    return sendPushToUser(user._id, {
      title: `Late blight risk at ${farm.name}`,
      body: `Warm, humid conditions expected from ${report.risk.periodStart}. Scout potato and tomato fields.`,
      url: `/farms/${farm._id.toString()}`,
      tag: `blight-${farmKey}`,
    });
  });
  return { alerts };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return jsonError("Unauthorized", 401);
  try {
    await connectDB();
    if (!pushEnabled()) return NextResponse.json({ skipped: "push not configured" });
    const now = new Date();
    const [reminders, weather] = await Promise.all([notifyReminders(now), notifyWeather()]);
    return NextResponse.json({ ...reminders, ...weather });
  } catch (error) {
    return serverError("GET /api/cron/reminders", error);
  }
}
