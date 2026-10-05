import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { FarmInput } from "@/lib/farm-schemas";
import { serializeFarm } from "@/lib/farm-service";
import { parseJsonBody, serverError } from "@/lib/http";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { User } from "@/lib/models/User";

export async function GET() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const userId = auth.user._id;

    const [farms, counts] = await Promise.all([
      Farm.find({ userId }).sort({ createdAt: -1 }).lean(),
      Field.aggregate<{ _id: unknown; count: number }>([
        { $match: { userId } },
        { $group: { _id: "$farmId", count: { $sum: 1 } } },
      ]),
    ]);
    const byFarm = new Map(counts.map((c) => [String(c._id), c.count]));
    return NextResponse.json({
      farms: farms.map((farm) => serializeFarm(farm, byFarm.get(farm._id.toString()) ?? 0)),
      activeFarmId: auth.user.activeFarmId ? auth.user.activeFarmId.toString() : null,
    });
  } catch (error) {
    return serverError("GET /api/farms", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const parsed = await parseJsonBody(req, FarmInput);
    if ("error" in parsed) return parsed.error;
    const { location, ...rest } = parsed.data;

    const farm = await Farm.create({ ...rest, ...(location && { location }), userId: auth.user._id });
    if (!auth.user.activeFarmId) {
      await User.updateOne({ _id: auth.user._id }, { $set: { activeFarmId: farm._id } });
    }
    return NextResponse.json(serializeFarm(farm.toObject(), 0), { status: 201 });
  } catch (error) {
    return serverError("POST /api/farms", error);
  }
}
