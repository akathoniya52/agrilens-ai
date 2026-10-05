import type { Severity } from "@/types/chat";
import type { LngLat } from "@/types/farm";
import type { OutbreakCell } from "@/types/insights";

/** Minimum distinct farmers per cell+condition before anything is shown (k-anonymity). */
export const OUTBREAK_K = 5;
/** ~11 km at the equator; coarse enough that a cell never pinpoints one farm. */
export const OUTBREAK_CELL_DEG = 0.1;
/** Accounts younger than this are ignored, so freshly created sock-puppets can't reach k. */
export const OUTBREAK_MIN_ACCOUNT_AGE_DAYS = 7;
const KM_PER_DEG = 111.32;
const EARTH_RADIUS_KM = 6371.0088;

export interface OutbreakInput {
  userId: string;
  condition: string;
  crop: string;
  severity: Severity;
  location: LngLat;
  createdAt: Date;
}

const SEVERITY_RANK: Record<Severity, number> = { none: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export const normalizeCondition = (condition: string) => condition.trim().toLowerCase().replace(/\s+/g, " ");

const HEALTHY = /^(healthy|none|no disease|normal)\b/;

export function isReportable(condition: string, severity: Severity): boolean {
  const name = normalizeCondition(condition);
  return Boolean(name) && severity !== "none" && !HEALTHY.test(name);
}

export function gridCell([lon, lat]: LngLat, cellDeg = OUTBREAK_CELL_DEG): { id: string; center: LngLat } {
  const ix = Math.floor(lon / cellDeg);
  const iy = Math.floor(lat / cellDeg);
  const decimals = Math.max(0, Math.ceil(-Math.log10(cellDeg)) + 1);
  const round = (n: number) => Number(n.toFixed(decimals));
  return { id: `${ix}:${iy}`, center: [round((ix + 0.5) * cellDeg), round((iy + 0.5) * cellDeg)] };
}

export function haversineKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Ids of every grid cell that overlaps the circle, plus a query radius that contains those cells
 * entirely. Results are then filtered to whole cells, so the radius never splits a cell and a
 * caller can't move a small circle around to isolate individual reports.
 */
export function cellsCoveringCircle(
  center: LngLat,
  radiusKm: number,
  cellDeg = OUTBREAK_CELL_DEG
): { ids: Set<string>; queryRadiusKm: number } {
  const [lon, lat] = center;
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = radiusKm / (KM_PER_DEG * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const ids = new Set<string>();
  for (let ix = Math.floor((lon - dLon) / cellDeg); ix <= Math.floor((lon + dLon) / cellDeg); ix++) {
    for (let iy = Math.floor((lat - dLat) / cellDeg); iy <= Math.floor((lat + dLat) / cellDeg); iy++) {
      const nearest: LngLat = [
        Math.min(Math.max(lon, ix * cellDeg), (ix + 1) * cellDeg),
        Math.min(Math.max(lat, iy * cellDeg), (iy + 1) * cellDeg),
      ];
      if (haversineKm(center, nearest) <= radiusKm) ids.add(`${ix}:${iy}`);
    }
  }
  return { ids, queryRadiusKm: radiusKm + cellDeg * KM_PER_DEG * Math.SQRT2 };
}

/** Coarse count bands so exact report numbers can't be diffed between queries. */
export function bandCount(n: number): string {
  if (n < 5) return "1–4";
  if (n < 10) return "5–9";
  if (n < 25) return "10–24";
  return "25+";
}

/** Monday (UTC) of the date's week, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const day = (date.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
  return start.toISOString().slice(0, 10);
}

interface Bucket {
  id: string;
  center: LngLat;
  condition: string;
  crops: Map<string, number>;
  users: Set<string>;
  cases: number;
  severity: Severity;
  latest: Date;
}

/**
 * Groups diagnoses by grid cell and condition, then drops any group reported by fewer than `k`
 * distinct users. Output carries only cell centres and counts — never user ids or exact points.
 */
export function aggregateOutbreaks(
  records: OutbreakInput[],
  { k = OUTBREAK_K, cellDeg = OUTBREAK_CELL_DEG, cellIds }: { k?: number; cellDeg?: number; cellIds?: Set<string> } = {}
): OutbreakCell[] {
  const buckets = new Map<string, Bucket>();
  for (const r of records) {
    if (!isReportable(r.condition, r.severity)) continue;
    const cell = gridCell(r.location, cellDeg);
    if (cellIds && !cellIds.has(cell.id)) continue;
    const condition = normalizeCondition(r.condition);
    const key = `${cell.id}|${condition}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { id: key, center: cell.center, condition, crops: new Map(), users: new Set(), cases: 0, severity: "none", latest: r.createdAt };
      buckets.set(key, bucket);
    }
    bucket.users.add(r.userId);
    bucket.cases += 1;
    const crop = r.crop.trim().toLowerCase();
    if (crop) bucket.crops.set(crop, (bucket.crops.get(crop) ?? 0) + 1);
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[bucket.severity]) bucket.severity = r.severity;
    if (r.createdAt > bucket.latest) bucket.latest = r.createdAt;
  }

  return [...buckets.values()]
    .filter((b) => b.users.size >= k)
    .sort((a, b) => b.users.size - a.users.size || b.cases - a.cases)
    .map((b) => ({
      id: b.id,
      center: b.center,
      condition: b.condition,
      crop: [...b.crops.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? "",
      cases: bandCount(b.cases),
      users: b.users.size,
      severity: b.severity,
      latest: weekStart(b.latest),
    }));
}
