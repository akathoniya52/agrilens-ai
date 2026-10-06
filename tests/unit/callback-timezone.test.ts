import { describe, expect, it } from "vitest";
import { DEFAULT_CALLBACK_URL, safeCallbackUrl, signInUrl } from "@/lib/callback-url";
import { dateKeyInZone, isValidTimeZone, parseInZone, resolveTimeZone } from "@/lib/timezone";

describe("safeCallbackUrl", () => {
  it("keeps same-origin paths", () => {
    expect(safeCallbackUrl("/farms/abc?tab=1#x")).toBe("/farms/abc?tab=1#x");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/foo\nbar",
    "/auth/signin?callbackUrl=/x",
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(safeCallbackUrl(value)).toBe(DEFAULT_CALLBACK_URL);
  });

  it("builds sign-in urls", () => {
    expect(signInUrl("/farms")).toBe("/auth/signin?callbackUrl=%2Ffarms");
    expect(signInUrl("//evil.com")).toBe("/auth/signin");
  });
});

describe("timezone", () => {
  it("validates zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone({})).toBe(false);
    expect(resolveTimeZone(undefined)).toBe("Asia/Kolkata");
  });

  it("reads bare local times in the given zone", () => {
    expect(parseInZone("2026-10-07T07:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-07T01:30:00.000Z");
    expect(parseInZone("2026-10-07T07:00:00+00:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-07T07:00:00.000Z");
    expect(parseInZone("tomorrow", "Asia/Kolkata")).toBeNull();
  });

  it("handles DST zones", () => {
    expect(parseInZone("2026-07-01T09:00", "America/New_York")?.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("computes the local date", () => {
    expect(dateKeyInZone(new Date("2026-10-06T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-07");
  });
});
