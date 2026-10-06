import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { findOwnedField } from "@/lib/farm-service";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { fetchNdvi, fetchNdviImage, inLookbackWindow, sentinelConfig } from "@/lib/ndvi";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import type { NdviResult } from "@/types/insights";

export const runtime = "nodejs";

type Params = { params: Promise<{ fieldId: string }> };

const ImageQuerySchema = z.object({
  date: z.iso
    .date()
    .refine((date) => inLookbackWindow(date))
    .optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const limited = await rateLimit("ndvi", auth.user._id.toString(), RATE_LIMITS.ndvi);
    if (limited) return limited;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id).lean();
    if (!field) return jsonError("Field not found", 404);
    if (!sentinelConfig()) return NextResponse.json<NdviResult>({ status: "not_configured" });
    if (!field.boundary?.coordinates?.length) return NextResponse.json<NdviResult>({ status: "no_boundary" });

    const key = `${field._id.toString()}:${field.updatedAt.getTime()}`;
    if (req.nextUrl.searchParams.get("format") === "png") {
      const query = ImageQuerySchema.safeParse({ date: req.nextUrl.searchParams.get("date") ?? undefined });
      if (!query.success) return jsonError("date must be a YYYY-MM-DD day within the last 90 days", 400);
      const image = await fetchNdviImage(key, field.boundary, { date: query.data.date });
      if (!image) return jsonError("No recent cloud-free satellite image", 404);
      return new Response(image.png, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=21600",
          "X-Scene-Date": image.sceneDate,
        },
      });
    }

    return NextResponse.json(await fetchNdvi(key, field.boundary));
  } catch (error) {
    return serverError("GET /api/fields/[fieldId]/ndvi", error);
  }
}
