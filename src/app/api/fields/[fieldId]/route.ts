import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { FieldPatch, definedOnly } from "@/lib/farm-schemas";
import { findOwnedField, isGeoIndexError, serializeField } from "@/lib/farm-service";
import { polygonAreaHa } from "@/lib/geo";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Reminder } from "@/lib/models/Reminder";
import { SensorReading } from "@/lib/models/SensorReading";

type Params = { params: Promise<{ fieldId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id).lean();
    if (!field) return jsonError("Field not found", 404);
    return NextResponse.json(serializeField(field));
  } catch (error) {
    return serverError("GET /api/fields/[fieldId]", error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const parsed = await parseJsonBody(req, FieldPatch);
    if ("error" in parsed) return parsed.error;

    const field = await findOwnedField(fieldId, auth.user._id);
    if (!field) return jsonError("Field not found", 404);

    const { boundary, sowingDate, areaHa, ...rest } = definedOnly(parsed.data);
    field.set(rest);
    if (sowingDate !== undefined) field.sowingDate = sowingDate ? new Date(sowingDate) : null;
    if (boundary !== undefined) {
      field.set("boundary", boundary ?? undefined);
      field.areaHa = boundary ? Math.round(polygonAreaHa(boundary) * 1000) / 1000 : areaHa ?? null;
    } else if (areaHa !== undefined) {
      field.areaHa = areaHa;
    }
    await field.save();
    return NextResponse.json(serializeField(field.toObject()));
  } catch (error) {
    if (isGeoIndexError(error)) return jsonError("Invalid field boundary", 400);
    return serverError("PATCH /api/fields/[fieldId]", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id);
    if (!field) return jsonError("Field not found", 404);

    await Promise.all([
      Reminder.deleteMany({ fieldId: field._id, userId: auth.user._id }),
      DiagnosisRecord.updateMany({ fieldId: field._id, userId: auth.user._id }, { $set: { fieldId: null } }),
      SensorReading.deleteMany({ fieldId: field._id, userId: auth.user._id }),
    ]);
    await field.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/fields/[fieldId]", error);
  }
}
