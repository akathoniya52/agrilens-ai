import { describe, expect, it } from "vitest";
import { closeRing, polygonAreaHa, ringAreaM2, ringCentroid } from "@/lib/geo";
import type { LngLat } from "@/types/farm";

const M_PER_DEG_LAT = 111_320;

/** Square of `sideM` metres centred on (lon, lat). */
function square(lon: number, lat: number, sideM: number): LngLat[] {
  const dLat = sideM / M_PER_DEG_LAT / 2;
  const dLon = sideM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)) / 2;
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
  ];
}

describe("polygon area (spherical shoelace)", () => {
  it("measures a 100 m square as ~1 ha at the equator and at mid-latitudes", () => {
    expect(polygonAreaHa(square(0, 0, 100))).toBeCloseTo(1, 2);
    expect(polygonAreaHa(square(72.5, 23, 100))).toBeCloseTo(1, 1);
  });

  it("is orientation-independent and accepts closed rings", () => {
    const ring = square(78, 21, 250);
    const a = ringAreaM2(ring);
    expect(ringAreaM2([...ring].reverse())).toBeCloseTo(a, 6);
    expect(ringAreaM2(closeRing(ring))).toBeCloseTo(a, 6);
  });

  it("subtracts holes and handles degenerate rings", () => {
    const outer = closeRing(square(10, 45, 200));
    const hole = closeRing(square(10, 45, 100));
    expect(polygonAreaHa({ type: "Polygon", coordinates: [outer, hole] })).toBeCloseTo(3, 1);
    expect(ringAreaM2([[0, 0], [1, 1]])).toBe(0);
  });

  it("computes ring centroid ignoring the closing vertex", () => {
    expect(ringCentroid(closeRing([[0, 0], [2, 0], [2, 2], [0, 2]]))).toEqual([1, 1]);
  });
});
