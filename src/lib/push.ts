import webpush, { WebPushError } from "web-push";
import type { Types } from "mongoose";
import { PushSubscriptionModel } from "@/lib/models/PushSubscription";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured: boolean | null = null;

/** Browser push services (Chrome/Edge via FCM, Firefox, Edge legacy/WNS, Safari). */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
];

/** Only real push services may be stored as endpoints, otherwise the cron would POST to arbitrary (internal) URLs. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname))
    );
  } catch {
    return false;
  }
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

/** Configures web-push once; returns false (push disabled) when VAPID keys are missing. */
export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@agrilens.app", publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("Invalid VAPID configuration:", error);
    configured = false;
  }
  return configured;
}

/** Per-request limit, so one slow push service can't stall a whole cron run. */
export const PUSH_TIMEOUT_MS = 8000;

export interface PushResult {
  delivered: number;
  /** Sends that failed for a reason worth retrying (not expired subscriptions). */
  failed: number;
}

/** Rejects if `promise` hasn't settled within `ms`; the timer is always cleared. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Sends to every subscription of the user; prunes expired ones. */
export async function sendPushToUser(userId: Types.ObjectId | string, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { delivered: 0, failed: 0 };
  if (!pushEnabled()) return result;
  const subs = await PushSubscriptionModel.find({ userId }).lean();
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      if (!isPushServiceEndpoint(sub.endpoint)) {
        await PushSubscriptionModel.deleteOne({ _id: sub._id });
        return;
      }
      try {
        // web-push's `timeout` is a socket idle timeout; the race bounds the whole request.
        await withTimeout(
          webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, {
            TTL: 60 * 60 * 12,
            timeout: PUSH_TIMEOUT_MS,
          }),
          PUSH_TIMEOUT_MS
        );
        result.delivered += 1;
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          await PushSubscriptionModel.deleteOne({ _id: sub._id, endpoint: sub.endpoint });
        } else {
          result.failed += 1;
          console.error("Web push failed:", error);
        }
      }
    })
  );
  return result;
}

export const REMINDER_MAX_ATTEMPTS = 3;
/** A claim older than this belongs to a run that died mid-send and may be taken over. */
export const REMINDER_CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Reminders a cron run may claim at `now`: unsent, not given up on, and not leased by a live run. */
export function claimableReminderFilter(now: Date) {
  return {
    done: false,
    notifiedAt: null,
    attempts: { $not: { $gte: REMINDER_MAX_ATTEMPTS } },
    $or: [{ claimedAt: null }, { claimedAt: { $lte: new Date(now.getTime() - REMINDER_CLAIM_LEASE_MS) } }],
  };
}

export type ReminderOutcome = "sent" | "retry" | "failed";

/**
 * What to record after a send. Any delivery (or no live subscription) counts as sent, so a device
 * that already got it isn't notified again; otherwise retry until the attempts run out.
 */
export function reminderOutcome(result: PushResult, attempts: number): ReminderOutcome {
  if (result.delivered > 0 || result.failed === 0) return "sent";
  return attempts >= REMINDER_MAX_ATTEMPTS ? "failed" : "retry";
}
