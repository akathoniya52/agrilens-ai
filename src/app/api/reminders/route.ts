import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ReminderCreate, type ReminderInput } from "@/lib/farm-schemas";
import { serializeReminder } from "@/lib/farm-service";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { Reminder } from "@/lib/models/Reminder";

type Input = z.infer<typeof ReminderInput>;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const params = req.nextUrl.searchParams;
    const filter: Record<string, unknown> = { userId: auth.user._id };
    for (const key of ["farmId", "fieldId"] as const) {
      const value = params.get(key);
      if (value) {
        if (!isObjectId(value)) return jsonError(`Invalid ${key}`, 400);
        filter[key] = value;
      }
    }
    const status = params.get("status") ?? "all";
    if (status === "open") filter.done = false;
    if (status === "done") filter.done = true;

    const reminders = await Reminder.find(filter).sort({ done: 1, dueAt: 1 }).limit(300).lean();
    return NextResponse.json(reminders.map(serializeReminder));
  } catch (error) {
    return serverError("GET /api/reminders", error);
  }
}

async function verifyOwnership(items: Input[], userId: Types.ObjectId) {
  const farmIds = [...new Set(items.map((i) => i.farmId).filter((v): v is string => !!v))];
  const fieldIds = [...new Set(items.map((i) => i.fieldId).filter((v): v is string => !!v))];
  const [farms, fields] = await Promise.all([
    farmIds.length ? Farm.countDocuments({ _id: { $in: farmIds }, userId }) : 0,
    fieldIds.length ? Field.find({ _id: { $in: fieldIds }, userId }).select("farmId").lean() : [],
  ]);
  if (farms !== farmIds.length || fields.length !== fieldIds.length) return null;
  return new Map(fields.map((f) => [f._id.toString(), f.farmId]));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const parsed = await parseJsonBody(req, ReminderCreate);
    if ("error" in parsed) return parsed.error;
    const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    const fieldFarms = await verifyOwnership(items, auth.user._id);
    if (!fieldFarms) return jsonError("Farm or field not found", 404);

    const docs = await Reminder.insertMany(
      items.map((item) => ({
        userId: auth.user._id,
        title: item.title,
        kind: item.kind,
        dueAt: new Date(item.dueAt),
        fieldId: item.fieldId ?? null,
        farmId: item.farmId ?? (item.fieldId ? fieldFarms.get(item.fieldId) : null) ?? null,
      }))
    );
    const created = docs.map((doc) => serializeReminder(doc.toObject()));
    return NextResponse.json(Array.isArray(parsed.data) ? created : created[0], { status: 201 });
  } catch (error) {
    return serverError("POST /api/reminders", error);
  }
}
