import type { LngLat } from "@/types/farm";

/**
 * Drops corners that sit on (or within `minDistance` of) the previous corner, plus a trailing corner
 * that repeats the first. Double-click-to-finish fires two clicks first, which would otherwise add a
 * duplicate corner that the server's geo index rejects.
 */
export function distinctCorners(ring: LngLat[], distance: (a: LngLat, b: LngLat) => number, minDistance = 0): LngLat[] {
  const corners: LngLat[] = [];
  for (const point of ring) {
    const previous = corners[corners.length - 1];
    if (previous && distance(previous, point) <= minDistance) continue;
    corners.push(point);
  }
  while (corners.length > 1 && distance(corners[0], corners[corners.length - 1]) <= minDistance) corners.pop();
  return corners;
}
