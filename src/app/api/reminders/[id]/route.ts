import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ReminderPatch } from "@/lib/farm-schemas";
import { serializeReminder } from "@/lib/farm-service";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { Reminder } from "@/lib/models/Reminder";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!isObjectId(id)) return jsonError("Reminder not found", 404);

    const parsed = await parseJsonBody(req, ReminderPatch);
    if ("error" in parsed) return parsed.error;

    const reminder = await Reminder.findOne({ _id: id, userId: auth.user._id });
    if (!reminder) return jsonError("Reminder not found", 404);

    const { title, dueAt, kind, done } = parsed.data;
    if (title !== undefined) reminder.title = title;
    if (kind !== undefined) reminder.kind = kind;
    if (done !== undefined) reminder.done = done;
    if (dueAt !== undefined) {
      reminder.dueAt = new Date(dueAt);
      reminder.notifiedAt = null;
    }
    await reminder.save();
    return NextResponse.json(serializeReminder(reminder.toObject()));
  } catch (error) {
    return serverError("PATCH /api/reminders/[id]", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!isObjectId(id)) return jsonError("Reminder not found", 404);

    const result = await Reminder.deleteOne({ _id: id, userId: auth.user._id });
    if (!result.deletedCount) return jsonError("Reminder not found", 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/reminders/[id]", error);
  }
}
