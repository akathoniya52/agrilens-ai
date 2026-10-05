import { describe, expect, it } from "vitest";
import { IMAGE_CHAT_TITLE, cleanTitle, escapeRegex, fallbackTitle } from "@/lib/text";

describe("fallbackTitle", () => {
  it("keeps short content", () => {
    expect(fallbackTitle("  Yellow leaves on   rice ")).toBe("Yellow leaves on rice");
  });

  it("truncates to 50 chars with ellipsis", () => {
    const title = fallbackTitle("a".repeat(80));
    expect(title).toBe(`${"a".repeat(50)}...`);
  });

  it("uses an image title for empty content", () => {
    expect(fallbackTitle("   ")).toBe(IMAGE_CHAT_TITLE);
  });
});

describe("cleanTitle", () => {
  it("strips quotes, prefixes and trailing punctuation", () => {
    expect(cleanTitle('"Title: Tomato leaf curl."')).toBe("Tomato leaf curl");
  });

  it("limits to 6 words and the first line", () => {
    expect(cleanTitle("one two three four five six seven\nsecond line")).toBe("one two three four five six");
  });

  it("returns null for empty output", () => {
    expect(cleanTitle("")).toBeNull();
    expect(cleanTitle(undefined)).toBeNull();
    expect(cleanTitle('  ""  ')).toBeNull();
  });
});

describe("escapeRegex", () => {
  it("escapes regex metacharacters", () => {
    const escaped = escapeRegex("a.b*(c)?[d]");
    expect(new RegExp(escaped).test("a.b*(c)?[d]")).toBe(true);
    expect(new RegExp(escaped).test("aXb")).toBe(false);
  });
});
