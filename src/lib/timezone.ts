/** Most users are in India; used when the browser never reported a time zone. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** True for IANA names the runtime understands ("Asia/Kolkata", "UTC"). */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

/** Calendar date ("YYYY-MM-DD") of `date` in `timeZone`. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (IST → 330). */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Parses an ISO date-time. With an explicit offset ("Z", "+05:30") it is used as-is; a bare local
 * time ("2026-10-07T07:00") is read in `timeZone`. Returns null when unparseable.
 */
export function parseInZone(value: string, timeZone: string): Date | null {
  const trimmed = value.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(trimmed);
  if (!local) {
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = local;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (Number.isNaN(guess)) return null;
  // Two passes handle DST edges: the offset at the guessed instant may differ from the final one.
  let ts = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  ts = guess - zoneOffsetMinutes(new Date(ts), timeZone) * 60_000;
  return new Date(ts);
}
