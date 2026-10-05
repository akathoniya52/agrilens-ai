import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Types } from "mongoose";
import { z } from "zod";
import { SensorReading, type ISensorReading } from "@/lib/models/SensorReading";
import type { SensorReadingDTO, SensorSnapshot } from "@/types/insights";

const TOKEN_PREFIX = "agl_";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BACKDATE_MS = 7 * 86_400_000;

export function generateDeviceToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyDeviceToken(token: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!token || !storedHash || !token.startsWith(TOKEN_PREFIX)) return false;
  const a = Buffer.from(hashDeviceToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenFromRequest(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers.get("x-device-token")?.trim() || null;
}

const metric = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().optional();

export const ReadingSchema = z
  .object({
    ts: z.union([z.string(), z.number()]).optional(),
    soilMoisture: metric(0, 100),
    soilTemp: metric(-40, 80),
    airTemp: metric(-40, 70),
    humidity: metric(0, 100),
    battery: metric(0, 100),
    deviceId: z.string().trim().max(64).optional(),
  })
  .refine(
    (r) => [r.soilMoisture, r.soilTemp, r.airTemp, r.humidity].some((v) => typeof v === "number"),
    "At least one of soilMoisture, soilTemp, airTemp, humidity is required"
  );

export const ReadingsBodySchema = z.union([ReadingSchema, z.array(ReadingSchema).min(1).max(100)]);

export type ReadingInput = z.infer<typeof ReadingSchema>;

/** Resolves the reading timestamp; devices without an RTC may omit it (or send epoch seconds). */
export function readingTime(ts: ReadingInput["ts"], now = Date.now()): Date | null {
  if (ts === undefined) return new Date(now);
  const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  if (!Number.isFinite(ms) || ms > now + MAX_CLOCK_SKEW_MS || ms < now - MAX_BACKDATE_MS) return null;
  return new Date(ms);
}

type LeanReading = Pick<ISensorReading, "ts" | "soilMoisture" | "soilTemp" | "airTemp" | "humidity" | "battery" | "deviceId">;

export function serializeReading(r: LeanReading): SensorReadingDTO {
  return {
    ts: new Date(r.ts).toISOString(),
    soilMoisture: r.soilMoisture ?? null,
    soilTemp: r.soilTemp ?? null,
    airTemp: r.airTemp ?? null,
    humidity: r.humidity ?? null,
    battery: r.battery ?? null,
    deviceId: r.deviceId ?? null,
  };
}

export async function sensorSnapshot(fieldId: Types.ObjectId, connected: boolean, hours = 24): Promise<SensorSnapshot> {
  const latest = await SensorReading.findOne({ fieldId }).sort({ ts: -1 }).lean();
  if (!latest) return { connected, latest: null, recent: [] };
  const since = new Date(latest.ts.getTime() - hours * 3_600_000);
  const recent = await SensorReading.find({ fieldId, ts: { $gte: since } }).sort({ ts: 1 }).limit(500).lean();
  return { connected, latest: serializeReading(latest), recent: recent.map(serializeReading) };
}

export function describeReading(r: SensorReadingDTO): string {
  const parts = [
    r.soilMoisture !== null && `soil moisture ${r.soilMoisture.toFixed(0)}%`,
    r.soilTemp !== null && `soil ${r.soilTemp.toFixed(1)}°C`,
    r.airTemp !== null && `air ${r.airTemp.toFixed(1)}°C`,
    r.humidity !== null && `RH ${r.humidity.toFixed(0)}%`,
  ].filter(Boolean);
  return parts.join(", ");
}
