import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isObjectId, jsonError, parseJsonBody, serverError } from "@/lib/http";
import { isLanguageCode } from "@/lib/languages";
import { User } from "@/lib/models/User";
import { serializeMe } from "@/lib/serialize";
import { PHONE_CODE_TTL_MS, generatePhoneCode, hashPhoneCode } from "@/lib/phone-link";
import { normalizePhone } from "@/lib/whatsapp";

const UpdateMeSchema = z.object({
  language: z.string().refine(isLanguageCode, "Unsupported language").optional(),
  theme: z.enum(["dark", "daylight"]).optional(),
  activeFarmId: z.string().refine(isObjectId, "Invalid farm id").nullable().optional(),
  notificationPrefs: z
    .object({
      weatherAlerts: z.boolean().optional(),
      reminders: z.boolean().optional(),
      pushSubscription: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .optional(),
  phone: z
    .string()
    .transform((value) => normalizePhone(value))
    .refine((value) => value.length >= 8 && value.length <= 15, "Enter the number with country code")
    .nullable()
    .optional(),
});

type UpdateMe = z.infer<typeof UpdateMeSchema>;

const PHONE_FIELDS = { pendingPhone: 1, phoneCodeHash: 1, phoneCodeExpiresAt: 1 } as const;

/**
 * A new number is never linked directly: it becomes `pendingPhone` with a hashed, short-lived code
 * that the owner must WhatsApp to the bot from that number (see whatsapp-bot.ts).
 */
function phoneUpdate(phone: string | null | undefined, code: string | null) {
  if (phone === undefined) return { set: {}, unset: {} };
  if (phone === null || !code) return { set: {}, unset: { phone: 1, ...PHONE_FIELDS } };
  return {
    set: {
      pendingPhone: phone,
      phoneCodeHash: hashPhoneCode(phone, code),
      phoneCodeExpiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS),
    },
    unset: {},
  };
}

function toUpdate({ notificationPrefs, ...rest }: Omit<UpdateMe, "phone">): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) update[key] = value;
  }
  for (const [key, value] of Object.entries(notificationPrefs ?? {})) {
    if (value !== undefined) update[`notificationPrefs.${key}`] = value;
  }
  return update;
}

export async function GET() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    return NextResponse.json(serializeMe(auth.user.toObject()));
  } catch (error) {
    return serverError("GET /api/me", error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const parsed = await parseJsonBody(req, UpdateMeSchema);
    if ("error" in parsed) return parsed.error;

    const { phone, ...preferences } = parsed.data;
    if (phone && (await User.exists({ phone, _id: { $ne: auth.user._id } }))) {
      return jsonError("This phone number is linked to another account", 409);
    }
    const code = phone ? generatePhoneCode() : null;
    const phoneChange = phoneUpdate(phone, code);
    const updated = await User.findByIdAndUpdate(
      auth.user._id,
      {
        $set: { ...toUpdate(preferences), ...phoneChange.set },
        ...(Object.keys(phoneChange.unset).length > 0 && { $unset: phoneChange.unset }),
      },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return serverError("PATCH /api/me", new Error("User disappeared"));

    return NextResponse.json({ ...serializeMe(updated), ...(code && { phoneCode: code }) });
  } catch (error) {
    return serverError("PATCH /api/me", error);
  }
}
