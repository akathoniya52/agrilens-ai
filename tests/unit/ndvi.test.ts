import { describe, expect, it } from "vitest";
import { parseNdviStats, summarizeNdvi } from "@/lib/ndvi";

const interval = (from: string, stats: Record<string, unknown> | null) => ({
  interval: { from: `${from}T00:00:00Z`, to: `${from}T23:59:59Z` },
  outputs: stats ? { ndvi: { bands: { B0: { stats } } } } : {},
});

describe("parseNdviStats", () => {
  it("parses statistics, sorts oldest first and drops empty/cloudy intervals", () => {
    const body = {
      data: [
        interval("2026-09-11", { min: 0.2, max: 0.8, mean: 0.6123, sampleCount: 100, noDataCount: 20 }),
        interval("2026-09-01", { min: 0.1, max: 0.7, mean: "0.55", sampleCount: 100, noDataCount: 0 }),
        interval("2026-09-06", { mean: "NaN", sampleCount: 100, noDataCount: 100 }),
        interval("2026-09-16", { mean: 0.5, sampleCount: 100, noDataCount: 100 }),
        interval("2026-09-21", null),
      ],
    };
    expect(parseNdviStats(body)).toEqual([
      { date: "2026-09-01", mean: 0.55, min: 0.1, max: 0.7, coverage: 1 },
      { date: "2026-09-11", mean: 0.612, min: 0.2, max: 0.8, coverage: 0.8 },
    ]);
    expect(parseNdviStats({ status: "FAILED" })).toEqual([]);
  });
});

describe("summarizeNdvi", () => {
  it("reports latest mean and change, ignoring low-coverage passes", () => {
    const result = summarizeNdvi([
      { date: "2026-09-01", mean: 0.7, min: 0, max: 1, coverage: 0.9 },
      { date: "2026-09-06", mean: 0.62, min: 0, max: 1, coverage: 0.8 },
      { date: "2026-09-11", mean: 0.1, min: 0, max: 1, coverage: 0.1 },
    ]);
    expect(result).toMatchObject({ status: "ok", mean: 0.62, latestDate: "2026-09-06", change: -0.08 });
  });

  it("returns no_data when nothing usable", () => {
    expect(summarizeNdvi([])).toEqual({ status: "no_data" });
  });
});
