import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, serverError } from "@/lib/http";
import { getMarketPrices } from "@/lib/market";

const QuerySchema = z.object({
  commodity: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return jsonError("commodity is required", 400);
    return NextResponse.json(await getMarketPrices(parsed.data));
  } catch (error) {
    return serverError("GET /api/market", error);
  }
}
