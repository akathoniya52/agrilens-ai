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

/** Sends to every subscription of the user; prunes expired ones. Returns the number delivered. */
export async function sendPushToUser(userId: Types.ObjectId | string, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0;
  const subs = await PushSubscriptionModel.find({ userId }).lean();
  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      if (!isPushServiceEndpoint(sub.endpoint)) {
        await PushSubscriptionModel.deleteOne({ _id: sub._id });
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 60 * 60 * 12 });
        delivered += 1;
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          await PushSubscriptionModel.deleteOne({ _id: sub._id });
        } else {
          console.error("Web push failed:", error);
        }
      }
    })
  );
  return delivered;
}
