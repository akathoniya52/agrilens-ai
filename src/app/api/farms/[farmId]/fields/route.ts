import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { FieldInput } from "@/lib/farm-schemas";
import { findOwnedFarm, isGeoIndexError, serializeField } from "@/lib/farm-service";
import { polygonAreaHa } from "@/lib/geo";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Field } from "@/lib/models/Field";

type Params = { params: Promise<{ farmId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { farmId } = await params;
    if (!isObjectId(farmId)) return jsonError("Farm not found", 404);

    const fields = await Field.find({ farmId, userId: auth.user._id }).sort({ createdAt: 1 }).lean();
    return NextResponse.json(fields.map(serializeField));
  } catch (error) {
    return serverError("GET /api/farms/[farmId]/fields", error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { farmId } = await params;
    if (!isObjectId(farmId)) return jsonError("Farm not found", 404);

    const parsed = await parseJsonBody(req, FieldInput);
    if ("error" in parsed) return parsed.error;

    const farm = await findOwnedFarm(farmId, auth.user._id).select("_id").lean();
    if (!farm) return jsonError("Farm not found", 404);

    const { boundary, sowingDate, areaHa, ...rest } = parsed.data;
    const field = await Field.create({
      ...rest,
      farmId: farm._id,
      userId: auth.user._id,
      sowingDate: sowingDate ? new Date(sowingDate) : null,
      ...(boundary && { boundary }),
      areaHa: boundary ? Math.round(polygonAreaHa(boundary) * 1000) / 1000 : areaHa ?? null,
    });
    return NextResponse.json(serializeField(field.toObject()), { status: 201 });
  } catch (error) {
    if (isGeoIndexError(error)) return jsonError("Invalid field boundary", 400);
    return serverError("POST /api/farms/[farmId]/fields", error);
  }
}
