import { NextRequest, NextResponse } from "next/server";
import { jsonError, safeEqual, serverError } from "@/lib/http";
import { connectDB } from "@/lib/mongodb";
import { Farm } from "@/lib/models/Farm";
import { Reminder } from "@/lib/models/Reminder";
import { User } from "@/lib/models/User";
import {
  REMINDER_MAX_ATTEMPTS,
  claimableReminderFilter,
  pushEnabled,
  reminderOutcome,
  sendPushToUser,
  type PushResult,
} from "@/lib/push";
import { dateKeyInZone, resolveTimeZone } from "@/lib/timezone";
import { getWeather, roundedLocation } from "@/lib/weather";
import type { WeatherReport } from "@/types/farm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily cron runs once, so notify everything due within the next 24h. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDERS = 500;
const PUSH_CONCURRENCY = 8;
/** No new work starts after this; in-flight steps are bounded (push 8 s, weather 6 s) to fit maxDuration. */
const RUN_BUDGET_MS = 38_000;
const WEATHER_BATCH = 50;
const MAX_WEATHER_USERS = 5000;
/** Users checked more recently than this are skipped, so overlapping runs don't alert twice. */
const WEATHER_RECHECK_MS = 12 * 60 * 60 * 1000;

/** Runs `task` over `items` with at most `limit` in flight, starting nothing after `deadline`. */
async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  deadline: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++];
      await task(item).catch((error: unknown) => {
        console.error("Cron notification failed:", error);
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

async function notifyReminders(now: Date, deadline: number) {
  const due = await Reminder.find({
    ...claimableReminderFilter(now),
    dueAt: { $lte: new Date(now.getTime() + LOOKAHEAD_MS) },
  })
    .sort({ dueAt: 1 })
    .limit(MAX_REMINDERS)
    .select("_id userId")
    .lean();
  const userIds = [...new Set(due.map((r) => r.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } }).select("_id timeZone notificationPrefs.reminders").lean();
  const optedOut = new Set(users.filter((u) => u.notificationPrefs?.reminders === false).map((u) => u._id.toString()));
  const zones = new Map(users.map((u) => [u._id.toString(), resolveTimeZone(u.timeZone)]));

  const counts = { sent: 0, retrying: 0, failed: 0 };
  // Claim with an expiring lease so overlapping runs never send the same reminder at once, and a
  // failed or interrupted send is retried by a later run (up to REMINDER_MAX_ATTEMPTS).
  await forEachWithConcurrency(due, PUSH_CONCURRENCY, deadline, async (candidate) => {
    const claimedAt = new Date();
    const reminder = await Reminder.findOneAndUpdate(
      { _id: candidate._id, ...claimableReminderFilter(claimedAt) },
      { $set: { claimedAt }, $inc: { attempts: 1 } },
      { new: true }
    ).lean();
    if (!reminder) return;
    const ours = { _id: reminder._id, claimedAt };

    if (optedOut.has(reminder.userId.toString())) {
      await Reminder.updateOne(ours, { $set: { notifiedAt: new Date(), claimedAt: null } });
      return;
    }
    const url = reminder.farmId ? `/farms/${reminder.farmId.toString()}` : "/farms";
    const result = await sendPushToUser(reminder.userId, {
      title: reminder.title,
      body: `Due ${dateKeyInZone(reminder.dueAt, zones.get(reminder.userId.toString()) ?? resolveTimeZone(null))}`,
      url,
      tag: `reminder-${reminder._id.toString()}`,
    }).catch((error: unknown): PushResult => {
      console.error("Cron reminder push failed:", error);
      return { delivered: 0, failed: 1 };
    });

    const outcome = reminderOutcome(result, reminder.attempts ?? REMINDER_MAX_ATTEMPTS);
    if (outcome === "sent") {
      await Reminder.updateOne(ours, { $set: { notifiedAt: new Date(), claimedAt: null } });
      counts.sent += 1;
    } else if (outcome === "retry") {
      await Reminder.updateOne(ours, { $set: { claimedAt: null } });
      counts.retrying += 1;
    } else {
      await Reminder.updateOne(ours, { $set: { failedAt: new Date(), claimedAt: null } });
      counts.failed += 1;
    }
  });
  return { due: due.length, ...counts };
}

async function notifyWeather(now: Date, deadline: number) {
  const recheckBefore = new Date(now.getTime() - WEATHER_RECHECK_MS);
  const stale = { $or: [{ lastWeatherCheckAt: null }, { lastWeatherCheckAt: { $lt: recheckBefore } }] };
  const eligible = { activeFarmId: { $ne: null }, "notificationPrefs.weatherAlerts": { $ne: false } };
  const weatherByLocation = new Map<string, Promise<WeatherReport | null>>();
  let checked = 0;
  let alerts = 0;

  // Oldest check first (never-checked users sort first), in batches until the time budget runs out.
  while (Date.now() < deadline && checked < MAX_WEATHER_USERS) {
    const batch = await User.find({ ...eligible, ...stale })
      .sort({ lastWeatherCheckAt: 1, _id: 1 })
      .limit(Math.min(WEATHER_BATCH, MAX_WEATHER_USERS - checked))
      .select("_id activeFarmId")
      .lean();
    if (!batch.length) break;
    checked += batch.length;

    await forEachWithConcurrency(batch, PUSH_CONCURRENCY, deadline, async (user) => {
      // Marking the user checked doubles as an atomic claim against a concurrent run.
      const claim = await User.updateOne({ _id: user._id, ...stale }, { $set: { lastWeatherCheckAt: new Date() } });
      if (!claim.modifiedCount) return;

      const farm = await Farm.findOne({ _id: user.activeFarmId, userId: user._id }).select("name location").lean();
      if (!farm?.location) return;
      const [lon, lat] = farm.location.coordinates;
      const spot = roundedLocation(lat, lon);
      let weather = weatherByLocation.get(spot.key);
      if (!weather) {
        weather = getWeather(spot.lat, spot.lon).catch((error: unknown) => {
          console.error("Cron weather lookup failed:", error);
          return null;
        });
        weatherByLocation.set(spot.key, weather);
      }
      const report = await weather;
      if (report?.risk.level !== "high") return;
      const farmKey = farm._id.toString();
      const result = await sendPushToUser(user._id, {
        title: `Late blight risk at ${farm.name}`,
        body: `Warm, humid conditions expected from ${report.risk.periodStart}. Scout potato and tomato fields.`,
        url: `/farms/${farmKey}`,
        tag: `blight-${farmKey}`,
      });
      alerts += result.delivered;
    });
  }
  return { weatherChecked: checked, alerts };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return jsonError("Unauthorized", 401);
  try {
    await connectDB();
    if (!pushEnabled()) return NextResponse.json({ skipped: "push not configured" });
    const now = new Date();
    const deadline = now.getTime() + RUN_BUDGET_MS;
    const [reminders, weather] = await Promise.all([notifyReminders(now, deadline), notifyWeather(now, deadline)]);
    return NextResponse.json({ ...reminders, ...weather });
  } catch (error) {
    return serverError("GET /api/cron/reminders", error);
  }
}
