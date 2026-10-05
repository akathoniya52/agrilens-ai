import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findOwnedField } from "@/lib/farm-service";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { fetchNdvi, fetchNdviImage, sentinelConfig } from "@/lib/ndvi";
import type { NdviResult } from "@/types/insights";

export const runtime = "nodejs";

type Params = { params: Promise<{ fieldId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id).lean();
    if (!field) return jsonError("Field not found", 404);
    if (!sentinelConfig()) return NextResponse.json<NdviResult>({ status: "not_configured" });
    if (!field.boundary?.coordinates?.length) return NextResponse.json<NdviResult>({ status: "no_boundary" });

    if (req.nextUrl.searchParams.get("format") === "png") {
      const png = await fetchNdviImage(field.boundary);
      if (!png) return jsonError("NDVI imagery is not configured", 503);
      return new Response(png, {
        headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=21600" },
      });
    }

    const key = `${field._id.toString()}:${field.updatedAt.getTime()}`;
    return NextResponse.json(await fetchNdvi(key, field.boundary));
  } catch (error) {
    return serverError("GET /api/fields/[fieldId]/ndvi", error);
  }
}
