import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isExpert, serializeCase } from "@/lib/cases";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Case } from "@/lib/models/Case";

type Params = { params: Promise<{ caseId: string }> };

const PatchSchema = z
  .object({
    status: z.enum(["open", "assigned", "resolved"]).optional(),
    note: z.string().trim().min(1).max(4000).optional(),
    assignToMe: z.boolean().optional(),
  })
  .refine((b) => b.status || b.note || b.assignToMe, { message: "Nothing to update" });

async function loadCase(caseId: string, userId: string, expert: boolean) {
  if (!isObjectId(caseId)) return null;
  return Case.findOne(expert ? { _id: caseId } : { _id: caseId, userId });
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { caseId } = await params;
    const found = await loadCase(caseId, auth.user._id.toString(), isExpert(auth.user.email));
    if (!found) return jsonError("Case not found", 404);
    return NextResponse.json(serializeCase(found.toObject()));
  } catch (error) {
    return serverError("GET /api/cases/[caseId]", error);
  }
}

/** Experts can assign/resolve any case; owners can add notes and resolve (close) their own. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const expert = isExpert(user.email);
    const { caseId } = await params;
    const parsed = await parseJsonBody(req, PatchSchema);
    if ("error" in parsed) return parsed.error;

    const found = await loadCase(caseId, user._id.toString(), expert);
    if (!found) return jsonError("Case not found", 404);
    const isOwner = found.userId.equals(user._id);
    const { status, note, assignToMe } = parsed.data;

    if ((assignToMe || (status && status !== "resolved")) && !expert) return jsonError("Only experts can do that", 403);
    if (status === "resolved" && !expert && !isOwner) return jsonError("Forbidden", 403);

    if (assignToMe) {
      found.assignedTo = user.email;
      if (found.status === "open") found.status = "assigned";
    }
    if (status) found.status = status;
    if (note) {
      found.notes.push({ author: user.name || user.email, role: expert && !isOwner ? "expert" : "farmer", text: note, at: new Date() });
    }
    await found.save();
    return NextResponse.json(serializeCase(found.toObject()));
  } catch (error) {
    return serverError("PATCH /api/cases/[caseId]", error);
  }
}
