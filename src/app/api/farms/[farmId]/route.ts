import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { FarmPatch, definedOnly } from "@/lib/farm-schemas";
import { findOwnedFarm, serializeDiagnosisPin, serializeFarm, serializeField } from "@/lib/farm-service";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Field } from "@/lib/models/Field";
import { Reminder } from "@/lib/models/Reminder";
import { User } from "@/lib/models/User";
import type { FarmDetail } from "@/types/farm";

type Params = { params: Promise<{ farmId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { farmId } = await params;
    if (!isObjectId(farmId)) return jsonError("Farm not found", 404);

    const farm = await findOwnedFarm(farmId, auth.user._id).lean();
    if (!farm) return jsonError("Farm not found", 404);

    const [fields, diagnoses] = await Promise.all([
      Field.find({ farmId: farm._id, userId: auth.user._id }).sort({ createdAt: 1 }).lean(),
      DiagnosisRecord.find({ farmId: farm._id, userId: auth.user._id }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    const body: FarmDetail = {
      farm: serializeFarm(farm, fields.length),
      fields: fields.map(serializeField),
      diagnoses: diagnoses.map(serializeDiagnosisPin),
    };
    return NextResponse.json(body);
  } catch (error) {
    return serverError("GET /api/farms/[farmId]", error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { farmId } = await params;
    if (!isObjectId(farmId)) return jsonError("Farm not found", 404);

    const parsed = await parseJsonBody(req, FarmPatch);
    if ("error" in parsed) return parsed.error;

    const farm = await findOwnedFarm(farmId, auth.user._id);
    if (!farm) return jsonError("Farm not found", 404);
    const { location, ...rest } = definedOnly(parsed.data);
    farm.set(rest);
    if (location !== undefined) farm.set("location", location ?? undefined);
    await farm.save();

    const fieldCount = await Field.countDocuments({ farmId: farm._id });
    return NextResponse.json(serializeFarm(farm.toObject(), fieldCount));
  } catch (error) {
    return serverError("PATCH /api/farms/[farmId]", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { farmId } = await params;
    if (!isObjectId(farmId)) return jsonError("Farm not found", 404);

    const farm = await findOwnedFarm(farmId, auth.user._id);
    if (!farm) return jsonError("Farm not found", 404);

    await Promise.all([
      Field.deleteMany({ farmId: farm._id, userId: auth.user._id }),
      Reminder.deleteMany({ farmId: farm._id, userId: auth.user._id }),
      DiagnosisRecord.updateMany({ farmId: farm._id, userId: auth.user._id }, { $set: { farmId: null, fieldId: null } }),
      User.updateOne({ _id: auth.user._id, activeFarmId: farm._id }, { $set: { activeFarmId: null } }),
    ]);
    await farm.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/farms/[farmId]", error);
  }
}
