import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findOwnedField } from "@/lib/farm-service";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { estimateYield } from "@/lib/yield";
import type { Severity } from "@/types/chat";

type Params = { params: Promise<{ fieldId: string }> };

const SEVERITY_ORDER: Severity[] = ["none", "low", "moderate", "high", "critical"];

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id).lean();
    if (!field) return jsonError("Field not found", 404);

    const since = new Date(Date.now() - 30 * 86_400_000);
    const recent = await DiagnosisRecord.find({ fieldId: field._id, userId: auth.user._id, createdAt: { $gte: since } })
      .select("severity")
      .lean();
    const worst = recent.reduce<Severity>(
      (acc, r) => (SEVERITY_ORDER.indexOf(r.severity) > SEVERITY_ORDER.indexOf(acc) ? r.severity : acc),
      "none"
    );
    const ndviParam = Number(req.nextUrl.searchParams.get("ndvi"));
    const ndvi = req.nextUrl.searchParams.has("ndvi") && Number.isFinite(ndviParam) && Math.abs(ndviParam) <= 1 ? ndviParam : null;

    return NextResponse.json(
      estimateYield({
        crop: field.crop,
        areaHa: field.areaHa ?? null,
        sowingDate: field.sowingDate ?? null,
        recentSeverity: worst,
        ndvi,
      })
    );
  } catch (error) {
    return serverError("GET /api/fields/[fieldId]/yield", error);
  }
}
