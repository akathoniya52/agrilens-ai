import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, serverError } from "@/lib/http";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Farm } from "@/lib/models/Farm";
import { User } from "@/lib/models/User";
import {
  OUTBREAK_CELL_DEG,
  OUTBREAK_K,
  OUTBREAK_MIN_ACCOUNT_AGE_DAYS,
  aggregateOutbreaks,
  cellsCoveringCircle,
} from "@/lib/outbreaks";
import type { LngLat } from "@/types/farm";
import type { OutbreakResponse } from "@/types/insights";

const EARTH_RADIUS_KM = 6378.1;
const MAX_RECORDS = 20_000;

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(5).max(500).default(100),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return jsonError("Invalid query", 400);
    const { lat, lon, radiusKm, days } = parsed.data;

    let center: LngLat | null = lat !== undefined && lon !== undefined ? [lon, lat] : null;
    if (!center && auth.user.activeFarmId) {
      const farm = await Farm.findOne({ _id: auth.user.activeFarmId, userId: auth.user._id }).select("location").lean();
      center = farm?.location?.coordinates ?? null;
    }

    const empty: OutbreakResponse = { center, radiusKm, days, k: OUTBREAK_K, cellDeg: OUTBREAK_CELL_DEG, cells: [] };
    if (!center) return NextResponse.json(empty);

    const coverage = cellsCoveringCircle(center, radiusKm);
    const records = await DiagnosisRecord.find({
      location: { $geoWithin: { $centerSphere: [center, coverage.queryRadiusKm / EARTH_RADIUS_KM] } },
      createdAt: { $gte: new Date(Date.now() - days * 86_400_000) },
      severity: { $ne: "none" },
    })
      .select("userId condition crop severity location createdAt")
      .limit(MAX_RECORDS)
      .lean();

    const userIds = [...new Set(records.map((r) => r.userId.toString()))];
    const accountCutoff = new Date(Date.now() - OUTBREAK_MIN_ACCOUNT_AGE_DAYS * 86_400_000);
    const established = new Set(
      (await User.find({ _id: { $in: userIds }, createdAt: { $lte: accountCutoff } }).select("_id").lean()).map((u) =>
        u._id.toString()
      )
    );

    const cells = aggregateOutbreaks(
      records.flatMap((r) =>
        r.location?.coordinates && established.has(r.userId.toString())
          ? [{ userId: r.userId.toString(), condition: r.condition, crop: r.crop, severity: r.severity, location: r.location.coordinates, createdAt: r.createdAt }]
          : []
      ),
      { cellIds: coverage.ids }
    );
    return NextResponse.json<OutbreakResponse>({ ...empty, cells });
  } catch (error) {
    return serverError("GET /api/outbreaks", error);
  }
}
