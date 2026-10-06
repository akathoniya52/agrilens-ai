import { describe, expect, it } from "vitest";
import {
  inLookbackWindow,
  latestCatalogDate,
  NDVI_IMAGE_EVALSCRIPT,
  NDVI_STATS_EVALSCRIPT,
  parseNdviStats,
  SCL_MASKED_CLASSES,
  summarizeNdvi,
} from "@/lib/ndvi";

type Pixel = { B04: number; B08: number; SCL: number; dataMask: number };
interface Evalscript {
  setup: () => { input: Array<{ bands: string[] }> };
  evaluatePixel: (s: Pixel) => unknown;
}

/** Runs an evalscript with a stand-in for Sentinel Hub's ColorRampVisualizer (returns NDVI as grey). */
function loadEvalscript(source: string): Evalscript {
  class ColorRampVisualizer {
    process(value: number) {
      return [value, value, value];
    }
  }
  return new Function("ColorRampVisualizer", `${source}\nreturn { setup, evaluatePixel };`)(ColorRampVisualizer);
}

const clear = { B04: 0.25, B08: 0.75, SCL: 4, dataMask: 1 };

describe("NDVI evalscripts", () => {
  it("leaves cloud, shadow, cirrus, snow and no-data pixels transparent on the heatmap", () => {
    const script = loadEvalscript(NDVI_IMAGE_EVALSCRIPT);
    expect(script.setup().input[0].bands).toContain("SCL");
    expect(script.evaluatePixel(clear)).toEqual([0.5, 0.5, 0.5, 1]);
    for (const SCL of [0, 1, 3, 8, 9, 10, 11]) expect(script.evaluatePixel({ ...clear, SCL })).toEqual([0, 0, 0, 0]);
    expect(script.evaluatePixel({ ...clear, dataMask: 0 })).toEqual([0, 0, 0, 0]);
    expect(SCL_MASKED_CLASSES).toEqual([0, 1, 3, 8, 9, 10, 11]);
  });

  it("excludes the same classes from the statistics", () => {
    const script = loadEvalscript(NDVI_STATS_EVALSCRIPT);
    expect(script.evaluatePixel(clear)).toMatchObject({ dataMask: [1] });
    expect(script.evaluatePixel({ ...clear, SCL: 9 })).toMatchObject({ dataMask: [0] });
    expect(script.evaluatePixel({ ...clear, SCL: 1 })).toMatchObject({ dataMask: [0] });
  });
});

describe("latestCatalogDate", () => {
  it("picks the newest date from a distinct-date search", () => {
    expect(latestCatalogDate({ type: "FeatureCollection", features: ["2026-09-21", "2026-09-30", "2026-09-26"] })).toBe("2026-09-30");
    expect(latestCatalogDate({ features: [] })).toBeNull();
    expect(latestCatalogDate({ features: [{ id: "x" }, "bad"] })).toBeNull();
    expect(latestCatalogDate(null)).toBeNull();
  });
});

describe("inLookbackWindow", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("accepts days within the last 90 days only", () => {
    expect(inLookbackWindow("2026-10-06", now)).toBe(true);
    expect(inLookbackWindow("2026-07-08", now)).toBe(true);
    expect(inLookbackWindow("2026-07-07", now)).toBe(false);
    expect(inLookbackWindow("2026-10-07", now)).toBe(false);
  });
});

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
