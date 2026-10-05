import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { getMarketPrices } from "@/lib/market";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { Reminder } from "@/lib/models/Reminder";
import type { UserDoc } from "@/lib/models/User";
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
        dueAt: { type: "string", description: "Due date-time, ISO 8601" },
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

type ToolResult = Record<string, unknown>;

const WeatherArgs = z.object({ lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional() });
const HistoryArgs = z.object({ field: z.string().max(80).optional(), days: z.number().int().min(1).max(730).optional() });
const ReminderArgs = z.object({
  title: z.string().trim().min(1).max(160),
  dueAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "Invalid date"),
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

async function createReminderTool(user: UserDoc, args: z.infer<typeof ReminderArgs>): Promise<ToolResult> {
  const dueAt = new Date(args.dueAt);
  if (dueAt.getTime() < Date.now() - 3_600_000) return { error: "dueAt is in the past" };
  const farm = await activeFarm(user);
  const field = args.field
    ? await Field.findOne({ userId: user._id, ...(farm && { farmId: farm._id }), name: new RegExp(`^${args.field.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean()
    : null;
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

/** Executes a model-requested tool for `user`. Never throws; errors are returned to the model. */
export async function executeAgentTool(user: UserDoc, name: string, args: unknown): Promise<ToolResult> {
  try {
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
        const a = parseArgs(ReminderArgs, args);
        return isError(a) ? a : await createReminderTool(user, a);
      }
      case "getMarketPrice": {
        const a = parseArgs(MarketArgs, args);
        return isError(a) ? a : await getMarketPriceTool(a);
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  } catch (error) {
    console.error(`AgriLens tool ${name} failed:`, error);
    return { error: "The tool is temporarily unavailable" };
  }
}
