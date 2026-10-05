import type { Theme } from "@/components/theme";

export interface NotificationPrefs {
  weatherAlerts: boolean;
  reminders: boolean;
}

/** GET /api/me */
export interface Me {
  _id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  credits: number;
  language: string;
  theme: Theme;
  activeFarmId: string | null;
  notificationPrefs: NotificationPrefs;
  phone?: string | null;
  /** Number awaiting WhatsApp verification, while its code is still valid. */
  pendingPhone?: string | null;
  pendingPhoneExpiresAt?: string | null;
  /** Only in the PATCH response that started verification; never stored in plain text. */
  phoneCode?: string;
  createdAt: string;
}

/** GET /api/stats */
export interface Stats {
  totalChats: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  diagnoses: number;
  credits: number;
  memberSince: string;
  lastActiveAt: string | null;
}

export interface MePatch {
  language?: string;
  theme?: Theme;
  activeFarmId?: string | null;
  notificationPrefs?: Partial<NotificationPrefs>;
  phone?: string | null;
}

/** Window event carrying the new credit balance as `detail: number`. */
export const CREDITS_EVENT = "agrilens:credits";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export async function patchMe(body: MePatch): Promise<Me> {
  const res = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /api/me → ${res.status}`);
  return (await res.json()) as Me;
}
