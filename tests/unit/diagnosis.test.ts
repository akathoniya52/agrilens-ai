import { describe, expect, it } from "vitest";
import { normalizeBox, normalizeConfidence, normalizeDiagnosis } from "@/lib/diagnosis";

describe("normalizeBox", () => {
  it("converts Gemini [ymin,xmin,ymax,xmax] 0–1000 to normalized x,y,w,h", () => {
    const box = normalizeBox({ label: "Lesion", confidence: 0.9, box_2d: [100, 200, 500, 600] });
    expect(box).not.toBeNull();
    expect(box?.label).toBe("Lesion");
    expect(box?.x).toBeCloseTo(0.2);
    expect(box?.y).toBeCloseTo(0.1);
    expect(box?.w).toBeCloseTo(0.4);
    expect(box?.h).toBeCloseTo(0.4);
  });

  it("clamps out-of-range and swaps inverted coordinates", () => {
    const box = normalizeBox({ box_2d: [1200, 800, -50, 400] });
    expect(box).toMatchObject({ label: "Affected area", x: 0.4, y: 0, w: 0.4, h: 1 });
  });

  it("rejects malformed or zero-area boxes", () => {
    expect(normalizeBox({ box_2d: [1, 2, 3] })).toBeNull();
    expect(normalizeBox({ box_2d: [1, 2, "3", 4] })).toBeNull();
    expect(normalizeBox({ box_2d: [10, 10, 10, 50] })).toBeNull();
  });
});

describe("normalizeDiagnosis", () => {
  it("normalizes a full Gemini response", () => {
    const d = normalizeDiagnosis({
      crop: " Tomato ",
      condition: "Late blight",
      confidence: 87,
      severity: "HIGH",
      affectedAreaPct: 140,
      boxes: [{ label: "spot", confidence: 0.5, box_2d: [0, 0, 500, 500] }, "junk", { box_2d: [] }],
    });
    expect(d).toEqual({
      crop: "Tomato",
      condition: "Late blight",
      confidence: 0.87,
      severity: "high",
      affectedAreaPct: 100,
      boxes: [{ label: "spot", confidence: 0.5, x: 0, y: 0, w: 0.5, h: 0.5 }],
    });
  });

  it("falls back for unknown severity and missing fields", () => {
    const d = normalizeDiagnosis({ condition: "Healthy", severity: "unknown" });
    expect(d).toMatchObject({ crop: "Unknown", severity: "none", confidence: 0, affectedAreaPct: 0, boxes: [] });
  });

  it("returns null when nothing was identified", () => {
    expect(normalizeDiagnosis(null)).toBeNull();
    expect(normalizeDiagnosis({ crop: "", condition: 5 })).toBeNull();
  });

  it("clamps confidence", () => {
    expect(normalizeConfidence(-1)).toBe(0);
    expect(normalizeConfidence(0.42)).toBe(0.42);
    expect(normalizeConfidence(250)).toBe(1);
    expect(normalizeConfidence(Number.NaN)).toBe(0);
  });
});
