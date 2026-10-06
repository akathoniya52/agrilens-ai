import type { GeoPolygon, LngLat } from "@/types/farm";

const EARTH_RADIUS_M = 6378137;
const rad = (deg: number) => (deg * Math.PI) / 180;

function openRing(ring: LngLat[]): LngLat[] {
  if (ring.length > 1) {
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx === lx && fy === ly) return ring.slice(0, -1);
  }
  return ring;
}

export function closeRing(ring: LngLat[]): LngLat[] {
  const open = openRing(ring);
  return open.length ? [...open, open[0]] : [];
}

/**
 * Spherical shoelace (Chamberlain & Duquette, 2007): area of a ring on a sphere in m².
 * Accepts open or closed rings; orientation-independent.
 */
export function ringAreaM2(ring: LngLat[]): number {
  const pts = openRing(ring);
  const n = pts.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [lon1] = pts[i];
    const [, lat2] = pts[(i + 1) % n];
    const [lon3] = pts[(i + 2) % n];
    sum += (rad(lon3) - rad(lon1)) * Math.sin(rad(lat2));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Polygon area in hectares (outer ring minus holes). */
export function polygonAreaHa(polygon: GeoPolygon | LngLat[]): number {
  const rings = Array.isArray(polygon) ? [polygon] : polygon.coordinates;
  if (!rings.length) return 0;
  const [outer, ...holes] = rings;
  const m2 = holes.reduce((acc, hole) => acc - ringAreaM2(hole), ringAreaM2(outer));
  return Math.max(0, m2) / 10_000;
}

export function ringCentroid(ring: LngLat[]): LngLat | null {
  const pts = openRing(ring);
  if (!pts.length) return null;
  const [sx, sy] = pts.reduce<[number, number]>(([x, y], [lon, lat]) => [x + lon, y + lat], [0, 0]);
  return [sx / pts.length, sy / pts.length];
}

export function toPolygon(ring: LngLat[]): GeoPolygon {
  return { type: "Polygon", coordinates: [closeRing(ring)] };
}

const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

/** Sign of the cross product (b - a) × (c - a): 1 left turn, -1 right turn, 0 collinear. */
function orientation(a: LngLat, b: LngLat, c: LngLat): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

const onSegment = (a: LngLat, b: LngLat, p: LngLat) =>
  Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);

/** True when segments ab and cd share any point (crossing, touching or overlapping). */
export function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  );
}

/** True when any two non-adjacent edges of the (open) ring touch. O(n²); rings are capped at 500 points. */
export function ringSelfIntersects(ring: LngLat[]): boolean {
  const pts = openRing(ring);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share a corner by construction.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

export type RingCheck = { ok: true; ring: LngLat[] } | { ok: false; error: string };

/**
 * Normalises a boundary ring the way MongoDB's 2dsphere index needs it: repeated consecutive
 * corners (e.g. from a double-click) are dropped and the ring is closed. Rejects rings with fewer
 * than 3 distinct corners, repeated corners or crossing edges.
 */
export function cleanRing(ring: LngLat[]): RingCheck {
  const deduped: LngLat[] = [];
  for (const point of ring) {
    if (!deduped.length || !samePoint(deduped[deduped.length - 1], point)) deduped.push(point);
  }
  const open = openRing(deduped);
  if (open.length < 3) return { ok: false, error: "Boundary needs at least 3 distinct corners" };
  const seen = new Set(open.map(([lon, lat]) => `${lon},${lat}`));
  if (seen.size !== open.length) return { ok: false, error: "Boundary passes through the same corner twice" };
  if (open.every((p) => orientation(open[0], open[1], p) === 0)) return { ok: false, error: "Boundary has no area" };
  if (ringSelfIntersects(open)) return { ok: false, error: "Boundary edges cross each other" };
  return { ok: true, ring: [...open, open[0]] };
}

export function isValidLngLat([lon, lat]: LngLat): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}
