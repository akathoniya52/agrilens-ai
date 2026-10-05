import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findOwnedField } from "@/lib/farm-service";
import { isObjectId, jsonError, serverError } from "@/lib/http";
import { generateDeviceToken, hashDeviceToken } from "@/lib/iot";

type Params = { params: Promise<{ fieldId: string }> };

/** Issues (or rotates) the field's device token. The plaintext is returned only once. */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id);
    if (!field) return jsonError("Field not found", 404);

    const token = generateDeviceToken();
    field.iotTokenHash = hashDeviceToken(token);
    await field.save();
    return NextResponse.json({ token, endpoint: `/api/iot/${field._id.toString()}/readings` });
  } catch (error) {
    return serverError("POST /api/fields/[fieldId]/iot-token", error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const { fieldId } = await params;
    if (!isObjectId(fieldId)) return jsonError("Field not found", 404);

    const field = await findOwnedField(fieldId, auth.user._id);
    if (!field) return jsonError("Field not found", 404);
    field.iotTokenHash = null;
    await field.save();
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/fields/[fieldId]/iot-token", error);
  }
}
