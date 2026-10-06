import { describe, expect, it } from "vitest";
import { distinctCorners } from "@/components/farm/ring";
import type { LngLat } from "@/types/farm";

const euclid = (a: LngLat, b: LngLat) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("distinctCorners", () => {
  it("drops the extra corner a finishing double-click adds", () => {
    const ring: LngLat[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [10.5, 10.2],
    ];
    expect(distinctCorners(ring, euclid, 1)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("removes exact repeats and a closing corner equal to the first", () => {
    const ring: LngLat[] = [
      [0, 0],
      [0, 0],
      [5, 0],
      [5, 5],
      [5, 5],
      [0, 0],
    ];
    expect(distinctCorners(ring, euclid)).toEqual([
      [0, 0],
      [5, 0],
      [5, 5],
    ]);
  });

  it("leaves fewer than 3 corners when the shape collapses", () => {
    const ring: LngLat[] = [
      [0, 0],
      [0.1, 0],
      [3, 3],
      [3.1, 3],
    ];
    expect(distinctCorners(ring, euclid, 1)).toHaveLength(2);
  });

  it("keeps a clean triangle untouched", () => {
    const ring: LngLat[] = [
      [0, 0],
      [4, 0],
      [0, 4],
    ];
    expect(distinctCorners(ring, euclid, 1)).toEqual(ring);
  });
});
