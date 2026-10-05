import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireUser } from "@/lib/auth";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import { Message } from "@/lib/models/Message";
import { Reminder } from "@/lib/models/Reminder";
import type { Severity } from "@/types/chat";
import type { DashboardData } from "@/types/farm";

const SEVERITIES: Severity[] = ["none", "low", "moderate", "high", "critical"];
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;
const GALLERY_LIMIT = 24;

const severityScore = {
  $indexOfArray: [SEVERITIES, "$severity"],
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const userId = auth.user._id;

    const farmId = req.nextUrl.searchParams.get("farmId");
    if (farmId && !isObjectId(farmId)) return jsonError("Invalid farmId", 400);
    const match: Record<string, unknown> = { userId, ...(farmId && { farmId: new Types.ObjectId(farmId) }) };
    const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

    const [facets, farms, fields, openReminders, recent] = await Promise.all([
      DiagnosisRecord.aggregate<{
        total: { n: number }[];
        overTime: { _id: { date: string; severity: Severity }; n: number }[];
        severity: { _id: Severity; n: number }[];
        topConditions: { _id: string; n: number }[];
        perField: { _id: Types.ObjectId; n: number; avg: number; last: Severity }[];
      }>([
        { $match: match },
        {
          $facet: {
            total: [{ $count: "n" }],
            overTime: [
              { $match: { createdAt: { $gte: since } } },
              { $group: { _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, severity: "$severity" }, n: { $sum: 1 } } },
            ],
            severity: [{ $group: { _id: "$severity", n: { $sum: 1 } } }],
            topConditions: [
              { $match: { condition: { $nin: ["", null] } } },
              { $group: { _id: { $toLower: "$condition" }, n: { $sum: 1 } } },
              { $sort: { n: -1 } },
              { $limit: 6 },
            ],
            perField: [
              { $match: { fieldId: { $ne: null } } },
              { $sort: { createdAt: -1 } },
              { $group: { _id: "$fieldId", n: { $sum: 1 }, avg: { $avg: severityScore }, last: { $first: "$severity" } } },
            ],
          },
        },
      ]),
      Farm.countDocuments({ userId, ...(farmId && { _id: farmId }) }),
      Field.find({ userId, ...(farmId && { farmId }) }).select("name crop").lean(),
      Reminder.countDocuments({ userId, done: false, ...(farmId && { farmId }) }),
      DiagnosisRecord.find({ ...match, sourceMessageId: { $ne: null } })
        .sort({ createdAt: -1 })
        .limit(GALLERY_LIMIT * 2)
        .lean(),
    ]);
    const f = facets[0];

    const byDate = new Map<string, DashboardData["overTime"][number]>();
    for (const { _id, n } of f.overTime) {
      const row = byDate.get(_id.date) ?? { date: _id.date, none: 0, low: 0, moderate: 0, high: 0, critical: 0 };
      row[_id.severity] += n;
      byDate.set(_id.date, row);
    }

    const fieldById = new Map(fields.map((fl) => [fl._id.toString(), fl]));
    const fieldHealth = f.perField
      .filter((row) => fieldById.has(row._id.toString()))
      .map((row) => {
        const field = fieldById.get(row._id.toString());
        return {
          fieldId: row._id.toString(),
          name: field?.name ?? "",
          crop: field?.crop ?? "",
          count: row.n,
          health: Math.round(100 - (Math.max(0, row.avg) / (SEVERITIES.length - 1)) * 100),
          lastSeverity: row.last,
        };
      });

    const sources = await Message.find({ _id: { $in: recent.map((r) => r.sourceMessageId) } })
      .select("attachments")
      .lean();
    const imageBySource = new Map(sources.map((m) => [m._id.toString(), m.attachments?.[0]?.url]));
    const gallery = recent
      .map((r) => ({
        _id: r._id.toString(),
        fieldId: r.fieldId ? r.fieldId.toString() : null,
        fieldName: r.fieldId ? fieldById.get(r.fieldId.toString())?.name ?? null : null,
        condition: r.condition,
        severity: r.severity,
        createdAt: r.createdAt.toISOString(),
        imageUrl: imageBySource.get(r.sourceMessageId?.toString() ?? "") ?? "",
      }))
      .filter((g) => g.imageUrl)
      .slice(0, GALLERY_LIMIT);

    const body: DashboardData = {
      totals: { diagnoses: f.total[0]?.n ?? 0, farms, fields: fields.length, openReminders },
      overTime: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      severity: SEVERITIES.map((severity) => ({ severity, count: f.severity.find((s) => s._id === severity)?.n ?? 0 })),
      topConditions: f.topConditions.map((c) => ({ condition: c._id, count: c.n })),
      fieldHealth,
      gallery,
    };
    return NextResponse.json(body);
  } catch (error) {
    return serverError("GET /api/dashboard", error);
  }
}
