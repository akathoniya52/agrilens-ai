import { patchMe, type Me } from "@/components/account";
import { isValidTimeZone } from "@/lib/timezone";

const SYNCED_KEY = "agrilens:tz-synced";

export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

function alreadySynced(marker: string): boolean {
  try {
    return sessionStorage.getItem(SYNCED_KEY) === marker;
  } catch {
    return false;
  }
}

function markSynced(marker: string): boolean {
  try {
    sessionStorage.setItem(SYNCED_KEY, marker);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores the browser's time zone on the account when it is missing or different, at most once per
 * tab session and user, so reminders ("tomorrow at 7am") are read in the farmer's local time.
 */
export async function syncTimeZone(me: Pick<Me, "_id" | "timeZone">): Promise<void> {
  const zone = browserTimeZone();
  if (!zone) return;
  const marker = `${me._id}:${zone}`;
  if (me.timeZone === zone || alreadySynced(marker)) return;
  markSynced(marker);
  try {
    await patchMe({ timeZone: zone });
  } catch (error) {
    console.warn("[time-zone] could not save the browser time zone", error instanceof Error ? error.message : error);
  }
}
