import { describe, expect, it } from "vitest";
import { PHONE_CODE_TTL_MS, extractPhoneCode, generatePhoneCode, hashPhoneCode, verifyPhoneCode } from "@/lib/phone-link";

const SECRET = "test-secret";
const PHONE = "919876543210";
const now = new Date("2026-10-01T10:00:00Z");
const pending = (code: string, overrides = {}) => ({
  pendingPhone: PHONE,
  phoneCodeHash: hashPhoneCode(PHONE, code, SECRET),
  phoneCodeExpiresAt: new Date(now.getTime() + PHONE_CODE_TTL_MS),
  ...overrides,
});

describe("phone link codes", () => {
  it("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(generatePhoneCode()).toMatch(/^\d{6}$/);
  });

  it("extracts codes from simple replies only", () => {
    expect(extractPhoneCode("123456")).toBe("123456");
    expect(extractPhoneCode(" 123 456 ")).toBe("123456");
    expect(extractPhoneCode("LINK 123456")).toBe("123456");
    expect(extractPhoneCode("my yield was 123456 kg")).toBeNull();
    expect(extractPhoneCode("12345")).toBeNull();
  });

  it("verifies the right code from the pending number before expiry", () => {
    expect(verifyPhoneCode(pending("123456"), PHONE, "123456", now, SECRET)).toBe(true);
  });

  it("rejects wrong codes, other senders, expired codes and missing state", () => {
    expect(verifyPhoneCode(pending("123456"), PHONE, "654321", now, SECRET)).toBe(false);
    expect(verifyPhoneCode(pending("123456"), "15550001111", "123456", now, SECRET)).toBe(false);
    const expired = pending("123456", { phoneCodeExpiresAt: new Date(now.getTime() - 1) });
    expect(verifyPhoneCode(expired, PHONE, "123456", now, SECRET)).toBe(false);
    expect(verifyPhoneCode({}, PHONE, "123456", now, SECRET)).toBe(false);
    expect(verifyPhoneCode(pending("123456"), PHONE, "123456", now, "other-secret")).toBe(false);
  });
});
