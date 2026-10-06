import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { getMarketPrices } from "@/lib/market";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { Reminder } from "@/lib/models/Reminder";
import type { UserDoc } from "@/lib/models/User";
import { parseInZone, resolveTimeZone } from "@/lib/timezone";
import { getWeather, weatherSummary } from "@/lib/weather";
import { REMINDER_KINDS } from "@/types/farm";

export const AGENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "getWeather",
    description:
      "7-day weather forecast with disease-risk and spray-window summary. Defaults to the user's active farm location when lat/lon are omitted.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude in degrees" },
        lon: { type: "number", description: "Longitude in degrees" },
      },
    },
  },
  {
    name: "getFieldHistory",
    description:
      "Past AI crop diagnoses on the user's farm (newest first), optionally filtered by field name or crop. Use for questions about previous problems or recurrence.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        field: { type: "string", description: "Field name or crop to filter by" },
        days: { type: "integer", description: "Look-back window in days (default 90)" },
      },
    },
  },
  {
    name: "createReminder",
    description:
      "Creates a reminder for the user (e.g. spray, irrigation, scouting). Only call when the user asks to be reminded or clearly agrees to it.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short reminder text in the user's language" },
        dueAt: {
          type: "string",
          description: "Due date-time, ISO 8601 with the user's UTC offset from the system prompt, e.g. 2026-10-07T07:00:00+05:30",
        },
        kind: { type: "string", enum: [...REMINDER_KINDS] },
        field: { type: "string", description: "Optional field name to attach the reminder to" },
      },
      required: ["title", "dueAt"],
    },
  },
  {
    name: "getMarketPrice",
    description:
      "Latest Indian mandi (APMC) prices in ₹/quintal for a commodity with a short-term trend and forecast. Use for selling or harvest-timing questions.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        commodity: { type: "string", description: "Commodity name in English, e.g. Wheat, Tomato, Onion" },
        state: { type: "string", description: "Indian state, e.g. Gujarat" },
        district: { type: "string" },
      },
      required: ["commodity"],
    },
  },
];

/** Words that signal a reminder request in the supported languages (en, hi, bn, gu, mr, ta, te, es, pt, sw). */
const REMINDER_KEYWORDS = [
  "remind", "reminder", "alarm", "notify", "notification", "alert me",
  "याद दिला", "yaad dila", "yad dila", "रिमाइंडर", "अलार्म", "सूचित",
  "মনে করিয়ে", "মনে করাবে", "রিমাইন্ডার", "অ্যালার্ম",
  "યાદ અપાવ", "યાદ કરાવ", "યાદ દેવડાવ", "રિમાઇન્ડર", "એલાર્મ",
  "आठवण", "स्मरण", "स्मरणपत्र",
  "நினைவூட்ட", "நினைவுபடுத்த", "ரிமைண்டர்", "அலாரம்",
  "గుర్తు చేయ", "గుర్తుచేయ", "రిమైండర్", "అలారం",
  "recuérd", "recuerd", "recordar", "recordatorio", "avísame", "avisame", "alarma",
  "lembr", "me avise", "avise-me", "alarme",
  "kumbush", "ukumbusho", "kengele",
];

/** True when the farmer's own message plausibly asks for a reminder; only then may the model create one. */
export function asksForReminder(text: string): boolean {
  const normalized = text.normalize("NFC").toLowerCase();
  return REMINDER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** Declarations offered to the model; createReminder only when the current message asks for a reminder. */
export function agentToolDeclarations({ allowReminder }: { allowReminder: boolean }): FunctionDeclaration[] {
  return allowReminder ? AGENT_TOOL_DECLARATIONS : AGENT_TOOL_DECLARATIONS.filter((d) => d.name !== "createReminder");
}

export interface ToolContext {
  allowReminder: boolean;
  signal?: AbortSignal;
  now?: Date;
}

type ToolResult = Record<string, unknown>;

const REMINDER_PAST_SLACK_MS = 5 * 60_000;
const REMINDER_MAX_AHEAD_MS = 366 * 86_400_000;

const WeatherArgs = z.object({ lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional() });
const HistoryArgs = z.object({ field: z.string().max(80).optional(), days: z.number().int().min(1).max(730).optional() });
const ReminderArgs = z.object({
  title: z.string().trim().min(1).max(160),
  dueAt: z.string().trim().min(10).max(40),
  kind: z.enum(REMINDER_KINDS).optional(),
  field: z.string().max(80).optional(),
});
const MarketArgs = z.object({
  commodity: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
});

const matches = (needle: string, ...values: Array<string | null | undefined>) => {
  const n = needle.trim().toLowerCase();
  return values.some((v) => v && v.toLowerCase().includes(n));
};

async function activeFarm(user: UserDoc) {
  if (!user.activeFarmId) return null;
  return Farm.findOne({ _id: user.activeFarmId, userId: user._id }).lean();
}

async function getWeatherTool(user: UserDoc, args: z.infer<typeof WeatherArgs>): Promise<ToolResult> {
  let lat = args.lat;
  let lon = args.lon;
  if (lat === undefined || lon === undefined) {
    const coords = (await activeFarm(user))?.location?.coordinates;
    if (!coords) return { error: "No location: the user has no active farm with a location. Ask where they are." };
    [lon, lat] = coords;
  }
  const report = await getWeather(lat, lon);
  return { summary: weatherSummary(report), current: report.current, risk: report.risk };
}

async function getFieldHistoryTool(user: UserDoc, args: z.infer<typeof HistoryArgs>): Promise<ToolResult> {
  const since = new Date(Date.now() - (args.days ?? 90) * 86_400_000);
  const fields = await Field.find({ userId: user._id }).select("name crop").lean();
  const fieldNames = new Map(fields.map((f) => [f._id.toString(), f.name]));
  const filter: Record<string, unknown> = { userId: user._id, createdAt: { $gte: since } };
  if (args.field) {
    const hits = fields.filter((f) => matches(args.field ?? "", f.name, f.crop)).map((f) => f._id);
    filter.$or = [{ fieldId: { $in: hits } }, { crop: new RegExp(args.field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  }
  const records = await DiagnosisRecord.find(filter).sort({ createdAt: -1 }).limit(15).lean();
  return {
    count: records.length,
    diagnoses: records.map((r) => ({
      date: r.createdAt.toISOString().slice(0, 10),
      field: r.fieldId ? fieldNames.get(r.fieldId.toString()) ?? null : null,
      crop: r.crop,
      condition: r.condition,
      severity: r.severity,
      confidence: Math.round(r.confidence * 100) / 100,
    })),
  };
}

/** Bare local times are read in the user's zone; returns an error the model can correct. */
export function resolveReminderDueAt(value: string, timeZone: string | null | undefined, now = new Date()): Date | { error: string } {
  const zone = resolveTimeZone(timeZone);
  const dueAt = parseInZone(value, zone);
  if (!dueAt) return { error: `dueAt must be ISO 8601 with a UTC offset, e.g. 2026-10-07T07:00:00+05:30 (user time zone ${zone})` };
  if (dueAt.getTime() < now.getTime() - REMINDER_PAST_SLACK_MS) {
    return { error: `dueAt is in the past; it is now ${now.toISOString()}. Ask the user for a future date.` };
  }
  if (dueAt.getTime() > now.getTime() + REMINDER_MAX_AHEAD_MS) return { error: "dueAt must be within one year" };
  return dueAt;
}

async function createReminderTool(
  user: UserDoc,
  args: z.infer<typeof ReminderArgs>,
  now?: Date,
  signal?: AbortSignal
): Promise<ToolResult> {
  const dueAt = resolveReminderDueAt(args.dueAt, user.timeZone, now);
  if (!(dueAt instanceof Date)) return dueAt;
  const farm = await activeFarm(user);
  const field = args.field
    ? await Field.findOne({ userId: user._id, ...(farm && { farmId: farm._id }), name: new RegExp(`^${args.field.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean()
    : null;
  if (signal?.aborted) return { error: "Cancelled by the user" };
  const reminder = await Reminder.create({
    userId: user._id,
    farmId: field?.farmId ?? farm?._id ?? null,
    fieldId: field?._id ?? null,
    title: args.title,
    dueAt,
    kind: args.kind ?? "custom",
  });
  return { created: true, id: reminder._id.toString(), title: reminder.title, dueAt: reminder.dueAt.toISOString(), field: field?.name ?? null };
}

async function getMarketPriceTool(args: z.infer<typeof MarketArgs>): Promise<ToolResult> {
  const result = await getMarketPrices(args);
  if (result.status !== "ok") {
    return { status: result.status, note: result.status === "not_configured" ? "Market prices are not configured on this server." : "No recent price data found." };
  }
  return {
    commodity: result.commodity,
    unit: "INR per quintal",
    latest: result.latest,
    trend: { ...result.trend, forecast: result.trend.forecast.slice(0, 7) },
    topMarkets: result.markets.slice(0, 5),
    source: "data.gov.in (Agmarknet)",
  };
}

function parseArgs<T extends z.ZodType>(schema: T, args: unknown): z.infer<T> | { error: string } {
  const parsed = schema.safeParse(args ?? {});
  return parsed.success ? parsed.data : { error: `Invalid arguments: ${parsed.error.issues[0]?.message ?? "unknown"}` };
}

const isError = (value: unknown): value is { error: string } =>
  typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";

/** Settles with an error result as soon as `signal` aborts, so Stop doesn't wait for slow tools. */
function abortable(task: Promise<ToolResult>, signal?: AbortSignal): Promise<ToolResult> {
  if (!signal) return task;
  const stopped: ToolResult = { error: "Cancelled by the user" };
  if (signal.aborted) return Promise.resolve(stopped);
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(stopped);
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Executes a model-requested tool for `user`. Never throws; errors are returned to the model. */
export async function executeAgentTool(user: UserDoc, name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
  if (context.signal?.aborted) return { error: "Cancelled by the user" };
  try {
    return await abortable(runTool(user, name, args, context), context.signal);
  } catch (error) {
    console.error(`AgriLens tool ${name} failed:`, error);
    return { error: "The tool is temporarily unavailable" };
  }
}

async function runTool(user: UserDoc, name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "getWeather": {
      const a = parseArgs(WeatherArgs, args);
      return isError(a) ? a : await getWeatherTool(user, a);
    }
    case "getFieldHistory": {
      const a = parseArgs(HistoryArgs, args);
      return isError(a) ? a : await getFieldHistoryTool(user, a);
    }
    case "createReminder": {
      if (!context.allowReminder) {
        return { error: "Reminders can only be created when the user asks for one. Offer it instead." };
      }
      const a = parseArgs(ReminderArgs, args);
      return isError(a) ? a : await createReminderTool(user, a, context.now, context.signal);
    }
    case "getMarketPrice": {
      const a = parseArgs(MarketArgs, args);
      return isError(a) ? a : await getMarketPriceTool(a);
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
