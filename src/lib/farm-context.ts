import type { Types } from "mongoose";
import { cropStage } from "@/lib/crop-calendar";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { SensorReading, type ISensorReading } from "@/lib/models/SensorReading";
import { describeReading, serializeReading } from "@/lib/iot";
import type { UserDoc } from "@/lib/models/User";
import type { ContextSection } from "@/lib/prompts";
import { resolveTimeZone } from "@/lib/timezone";
import { getWeather, weatherSummary } from "@/lib/weather";

const fmtLatLon = ([lon, lat]: [number, number]) => `${lat.toFixed(3)}, ${lon.toFixed(3)}`;

const SENSOR_FRESH_MS = 24 * 3_600_000;

async function latestSensorLines(fieldIds: Types.ObjectId[], now: Date): Promise<Map<string, string>> {
  if (!fieldIds.length) return new Map();
  const rows = await SensorReading.aggregate<{ _id: Types.ObjectId; reading: ISensorReading }>([
    { $match: { fieldId: { $in: fieldIds }, ts: { $gte: new Date(now.getTime() - SENSOR_FRESH_MS) } } },
    { $sort: { ts: -1 } },
    { $group: { _id: "$fieldId", reading: { $first: "$$ROOT" } } },
  ]);
  return new Map(
    rows.map((row) => {
      const minutes = Math.round((now.getTime() - new Date(row.reading.ts).getTime()) / 60_000);
      return [row._id.toString(), `${describeReading(serializeReading(row.reading))} (${minutes} min ago)`];
    })
  );
}

/** Active-farm grounding for the chat system prompt. Never throws; returns [] when unavailable. */
export async function farmContext(user: UserDoc): Promise<ContextSection[]> {
  if (!user.activeFarmId) return [];
  try {
    const [farm, fields] = await Promise.all([
      Farm.findOne({ _id: user.activeFarmId, userId: user._id }).lean(),
      Field.find({ farmId: user.activeFarmId, userId: user._id }).sort({ createdAt: 1 }).limit(12).lean(),
    ]);
    if (!farm) return [];

    const farmLines = [
      `Name: ${farm.name}`,
      farm.location && `Location (lat, lon): ${fmtLatLon(farm.location.coordinates)}`,
      farm.crops.length > 0 && `Crops: ${farm.crops.join(", ")}`,
      farm.areaHa && `Area: ${farm.areaHa} ha`,
      farm.soilType && `Soil: ${farm.soilType.replace("_", " ")}`,
      farm.irrigation && `Irrigation: ${farm.irrigation}`,
    ].filter(Boolean);

    const now = new Date();
    const timeZone = resolveTimeZone(user.timeZone);
    const sensors = await latestSensorLines(fields.map((f) => f._id), now);
    const fieldLines = fields.map((field) => {
      const parts = [`${field.name}: ${field.crop || "unknown crop"}`];
      if (field.areaHa) parts.push(`${field.areaHa.toFixed(2)} ha`);
      if (field.sowingDate) {
        const info = cropStage(field.crop, field.sowingDate, now, timeZone);
        if (info.status === "growing") parts.push(`${info.das} days after sowing, ${info.stage?.label ?? "growing"} stage`);
        else if (info.status === "planned") parts.push(`sowing planned in ${-info.das} days`);
        else parts.push(`season finished (${info.das} days after sowing)`);
      }
      const sensor = sensors.get(field._id.toString());
      if (sensor) parts.push(`sensors: ${sensor}`);
      return `- ${parts.join(", ")}`;
    });

    const weather = farm.location
      ? await getWeather(farm.location.coordinates[1], farm.location.coordinates[0])
          .then(weatherSummary)
          .catch(() => "")
      : "";

    return [
      { label: "User's active farm", content: farmLines.join("\n") },
      { label: "Fields on this farm", content: fieldLines.join("\n") },
      { label: "Local weather forecast", content: weather },
    ];
  } catch (error) {
    console.error("AgriLens farm context failed:", error);
    return [];
  }
}
