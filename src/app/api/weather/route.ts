import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findOwnedFarm } from "@/lib/farm-service";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { getWeather } from "@/lib/weather";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const farmId = req.nextUrl.searchParams.get("farmId") ?? auth.user.activeFarmId?.toString();
    if (!farmId || !isObjectId(farmId)) return jsonError("Farm not found", 404);

    const farm = await findOwnedFarm(farmId, auth.user._id).select("location").lean();
    if (!farm) return jsonError("Farm not found", 404);
    if (!farm.location) return jsonError("Farm has no location", 422);

    const [lon, lat] = farm.location.coordinates;
    try {
      const report = await getWeather(lat, lon);
      return NextResponse.json(report, { headers: { "Cache-Control": "private, max-age=600" } });
    } catch (error) {
      console.error("Open-Meteo request failed:", error);
      return jsonError("Weather unavailable", 502);
    }
  } catch (error) {
    return serverError("GET /api/weather", error);
  }
}
