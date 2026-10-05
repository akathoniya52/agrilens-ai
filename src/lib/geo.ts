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

export function isValidLngLat([lon, lat]: LngLat): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}
