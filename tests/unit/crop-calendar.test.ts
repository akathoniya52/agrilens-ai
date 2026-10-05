import { describe, expect, it } from "vitest";
import { buildCropCalendar, cropStage, resolveCropKey } from "@/lib/crop-calendar";

const SOWN = "2026-06-01T00:00:00.000Z";
const day = (n: number) => new Date(Date.parse(SOWN) + n * 86_400_000);

describe("resolveCropKey", () => {
  it("maps names, aliases and unknown crops", () => {
    expect(resolveCropKey("Wheat")).toBe("wheat");
    expect(resolveCropKey("paddy")).toBe("rice");
    expect(resolveCropKey("Corn")).toBe("maize");
    expect(resolveCropKey("cherry tomato")).toBe("tomato");
    expect(resolveCropKey("okra")).toBe("generic");
    expect(resolveCropKey("")).toBe("generic");
  });
});

describe("buildCropCalendar", () => {
  it("lays out contiguous stages from the sowing date", () => {
    const cal = buildCropCalendar("wheat", SOWN);
    expect(cal.stages[0].startDate).toBe(SOWN);
    for (let i = 1; i < cal.stages.length; i++) expect(cal.stages[i].start).toBe(cal.stages[i - 1].end);
    expect(cal.totalDays).toBe(cal.stages[cal.stages.length - 1].end);
  });

  it("includes dated, sorted tasks with periodic scouting and a harvest", () => {
    const cal = buildCropCalendar("tomato", SOWN);
    const days = cal.tasks.map((t) => t.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(cal.tasks.filter((t) => t.kind === "scouting").length).toBeGreaterThan(3);
    const harvest = cal.tasks.find((t) => t.kind === "harvest");
    expect(harvest?.date).toBe(day(harvest?.day ?? 0).toISOString());
  });

  it("has templates for every common crop", () => {
    for (const crop of ["wheat", "rice", "maize", "cotton", "tomato", "potato", "soybean", "sugarcane", "lentil"]) {
      const cal = buildCropCalendar(crop, SOWN);
      expect(cal.stages.length).toBeGreaterThan(3);
      expect(cal.tasks.some((t) => t.kind === "harvest")).toBe(true);
    }
  });
});

describe("cropStage", () => {
  it("reports planned, growing and harvested states", () => {
    expect(cropStage("potato", SOWN, day(-3))).toMatchObject({ status: "planned", das: -3 });
    const growing = cropStage("potato", SOWN, day(40));
    expect(growing.status).toBe("growing");
    expect(growing.stage?.key).toBe("tuberInit");
    expect(growing.progress).toBeCloseTo(40 / 110);
    expect(cropStage("potato", SOWN, day(200)).status).toBe("harvested");
  });
});
