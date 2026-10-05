import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findOwnedField } from "@/lib/farm-service";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { ReadingsBodySchema, readingTime, sensorSnapshot, tokenFromRequest, verifyDeviceToken } from "@/lib/iot";
import { Field } from "@/lib/models/Field";
import { SensorReading } from "@/lib/models/SensorReading";
import { connectDB } from "@/lib/mongodb";

export const runtime = "nodejs";

type Params = { params: Promise<{ fieldId: string }> };

/** Device webhook (ESP32 / MQTT bridge). Auth: `Authorization: Bearer agl_…` or `X-Device-Token`. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Unauthorized", 401);
    const token = tokenFromRequest(req.headers);
    if (!token) return jsonError("Unauthorized", 401);

    await connectDB();
    const field = await Field.findById(fieldId).select("userId iotTokenHash").lean();
    if (!field || !verifyDeviceToken(token, field.iotTokenHash)) return jsonError("Unauthorized", 401);

    const parsed = await parseJsonBody(req, ReadingsBodySchema);
    if ("error" in parsed) return parsed.error;
    const inputs = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    const now = Date.now();
    const docs = inputs.flatMap((r) => {
      const ts = readingTime(r.ts, now);
      if (!ts) return [];
      return [{
        fieldId: field._id,
        userId: field.userId,
        ts,
        soilMoisture: r.soilMoisture ?? null,
        soilTemp: r.soilTemp ?? null,
        airTemp: r.airTemp ?? null,
        humidity: r.humidity ?? null,
        battery: r.battery ?? null,
        deviceId: r.deviceId ?? null,
      }];
    });
    if (!docs.length) return jsonError("ts: out of accepted range", 400);
    await SensorReading.insertMany(docs);
    return NextResponse.json({ accepted: docs.length, rejected: inputs.length - docs.length }, { status: 201 });
  } catch (error) {
    return serverError("POST /api/iot/[fieldId]/readings", error);
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id).select("iotTokenHash").lean();
    if (!field) return jsonError("Field not found", 404);
    const hours = Math.min(168, Math.max(1, Number(req.nextUrl.searchParams.get("hours")) || 24));
    return NextResponse.json(await sensorSnapshot(field._id, Boolean(field.iotTokenHash), hours));
  } catch (error) {
    return serverError("GET /api/iot/[fieldId]/readings", error);
  }
}
