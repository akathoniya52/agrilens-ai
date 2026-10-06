import { describe, expect, it } from "vitest";
import { FarmInput, FarmPatch, FieldInput, FieldPatch, PolygonInput, definedOnly } from "@/lib/farm-schemas";
import { cleanRing, ringSelfIntersects, segmentsIntersect } from "@/lib/geo";
import type { LngLat } from "@/types/farm";

describe("farm/field patches (#1)", () => {
  it("PATCH {name} leaves crops unchanged", () => {
    const patch = FarmPatch.parse({ name: "North plot" });
    expect(patch).not.toHaveProperty("crops");
    expect(definedOnly(patch)).toEqual({ name: "North plot" });
  });

  it("PATCH {name} leaves a field's crop unchanged", () => {
    const patch = FieldPatch.parse({ name: "Field 2" });
    expect(patch).not.toHaveProperty("crop");
  });

  it("still applies defaults on create and accepts explicit values on patch", () => {
    expect(FarmInput.parse({ name: "Farm" }).crops).toEqual([]);
    expect(FieldInput.parse({ name: "Field" }).crop).toBe("");
    expect(FarmPatch.parse({ crops: ["wheat"] }).crops).toEqual(["wheat"]);
    expect(FieldPatch.parse({ crop: "" }).crop).toBe("");
  });
});

const A: LngLat = [72.5, 23.0];
const B: LngLat = [72.51, 23.0];
const C: LngLat = [72.51, 23.01];
const D: LngLat = [72.5, 23.01];

describe("cleanRing (#2)", () => {
  it("drops the duplicate corner a double-click adds and closes the ring", () => {
    expect(cleanRing([A, B, C, C, D, A])).toEqual({ ok: true, ring: [A, B, C, D, A] });
    expect(cleanRing([A, B, C, D])).toEqual({ ok: true, ring: [A, B, C, D, A] });
    expect(cleanRing([A, A, B, C, A, A])).toEqual({ ok: true, ring: [A, B, C, A] });
  });

  it("requires at least 3 distinct corners", () => {
    expect(cleanRing([A, B, B, A]).ok).toBe(false);
    expect(cleanRing([A, A, A, A]).ok).toBe(false);
  });

  it("rejects collinear corners and repeated non-consecutive corners", () => {
    expect(cleanRing([A, B, [72.52, 23.0], A]).ok).toBe(false);
    expect(cleanRing([A, B, C, A, D, A]).ok).toBe(false);
  });

  it("rejects self-crossing (bow-tie) boundaries", () => {
    const result = cleanRing([A, C, B, D, A]);
    expect(result).toEqual({ ok: false, error: "Boundary edges cross each other" });
  });
});

describe("segment intersection", () => {
  it("detects crossing, touching and collinear overlap but not disjoint segments", () => {
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [2, 0], [1, 0], [1, 5])).toBe(true);
    expect(segmentsIntersect([0, 0], [2, 0], [1, 0], [3, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0])).toBe(false);
    expect(segmentsIntersect([0, 0], [1, 1], [0, 1], [0.4, 0.6])).toBe(false);
  });

  it("accepts a concave ring and flags an edge that doubles back", () => {
    expect(ringSelfIntersects([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]])).toBe(false);
    expect(ringSelfIntersects([[0, 0], [4, 0], [4, 4], [2, -1], [0, 4]])).toBe(true);
  });
});

describe("PolygonInput (#2)", () => {
  it("returns the cleaned polygon", () => {
    const parsed = PolygonInput.parse({ type: "Polygon", coordinates: [[A, B, C, C, D, A]] });
    expect(parsed.coordinates[0]).toEqual([A, B, C, D, A]);
  });

  it("fails validation with a clear message for bad rings", () => {
    const result = PolygonInput.safeParse({ type: "Polygon", coordinates: [[A, C, B, D, A]] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Boundary edges cross each other");
    expect(FieldPatch.safeParse({ boundary: { type: "Polygon", coordinates: [[A, B, B, A]] } }).success).toBe(false);
  });
});
