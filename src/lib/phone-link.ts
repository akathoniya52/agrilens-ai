import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_PATTERN = /^(?:link\s*)?(\d{3})\s?(\d{3})$/i;

export interface PendingPhone {
  pendingPhone?: string | null;
  phoneCodeHash?: string | null;
  phoneCodeExpiresAt?: Date | null;
}

function codeSecret(): string {
  return process.env.NEXTAUTH_SECRET || "agrilens-phone-link";
}

export function generatePhoneCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Bound to the phone number so a code is useless when sent from any other sender. */
export function hashPhoneCode(phone: string, code: string, secret = codeSecret()): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** Accepts "123456", "123 456" or "LINK 123456"; anything else is a normal question. */
export function extractPhoneCode(text: string): string | null {
  const match = CODE_PATTERN.exec(text.trim());
  return match ? `${match[1]}${match[2]}` : null;
}

export function verifyPhoneCode(
  pending: PendingPhone,
  from: string,
  code: string,
  now = new Date(),
  secret = codeSecret()
): boolean {
  const { pendingPhone, phoneCodeHash, phoneCodeExpiresAt } = pending;
  if (!pendingPhone || !phoneCodeHash || !phoneCodeExpiresAt) return false;
  if (pendingPhone !== from || phoneCodeExpiresAt.getTime() <= now.getTime()) return false;
  const expected = Buffer.from(hashPhoneCode(from, code, secret), "hex");
  const given = Buffer.from(phoneCodeHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
