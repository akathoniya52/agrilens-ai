import { describe, expect, it } from "vitest";
import { z } from "zod";
import { calendarDaysBetween, cropStage } from "@/lib/crop-calendar";
import { aggregateOutbreaks, optionalCoordParam, roundUsers, type OutbreakInput } from "@/lib/outbreaks";

describe("roundUsers (#33)", () => {
  it("rounds down to a multiple of k and never below k", () => {
    expect([5, 6, 9, 10, 14, 23].map((n) => roundUsers(n))).toEqual([5, 5, 5, 10, 10, 20]);
  });

  it("publishes the rounded count", () => {
    const rec = (userId: string): OutbreakInput => ({
      userId,
      condition: "Rust",
      crop: "wheat",
      severity: "low",
      location: [72.571, 23.022],
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    const cells = aggregateOutbreaks(["a", "b", "c", "d", "e", "f", "g"].map(rec), { k: 5 });
    expect(cells[0].users).toBe(5);
  });
});

describe("outbreak query params (#35)", () => {
  const Query = z.object({ lat: optionalCoordParam(-90, 90), lon: optionalCoordParam(-180, 180) });

  it("treats empty strings as missing, not (0, 0)", () => {
    expect(Query.parse({ lat: "", lon: " " })).toEqual({ lat: undefined, lon: undefined });
    expect(Query.parse({})).toEqual({ lat: undefined, lon: undefined });
  });

  it("still parses and bounds real values", () => {
    expect(Query.parse({ lat: "23.02", lon: "0" })).toEqual({ lat: 23.02, lon: 0 });
    expect(Query.safeParse({ lat: "91" }).success).toBe(false);
    expect(Query.safeParse({ lat: "abc" }).success).toBe(false);
  });
});

describe("days after sowing in the user's time zone (#39)", () => {
  // Sown "1 June" in India: local midnight = 2026-05-31T18:30Z.
  const sown = new Date("2026-05-31T18:30:00Z");

  it("ticks over at local midnight, not 05:30 IST", () => {
    expect(calendarDaysBetween(sown, new Date("2026-06-10T18:29:00Z"), "Asia/Kolkata")).toBe(9);
    expect(calendarDaysBetween(sown, new Date("2026-06-10T18:31:00Z"), "Asia/Kolkata")).toBe(10);
    expect(calendarDaysBetween(sown, new Date("2026-06-11T01:00:00Z"), "Asia/Kolkata")).toBe(10);
  });

  it("cropStage uses the given zone", () => {
    expect(cropStage("potato", sown, new Date("2026-05-31T19:00:00Z"), "Asia/Kolkata").das).toBe(0);
    expect(cropStage("potato", sown, new Date("2026-05-31T19:00:00Z"), "UTC").das).toBe(0);
    expect(cropStage("potato", sown, new Date("2026-05-31T17:00:00Z"), "Asia/Kolkata").das).toBe(-1);
  });
});
