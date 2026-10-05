import type { GeoPolygon } from "@/types/farm";
import type { NdviPoint, NdviResult } from "@/types/insights";

const DEFAULT_BASE_URL = "https://sh.dataspace.copernicus.eu";
const DEFAULT_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;
const CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
/** ~10 m in degrees (Sentinel-2 red/NIR native resolution). */
const RES_DEG = 0.0001;

// SCL classes 3 (cloud shadow), 8–9 (cloud), 10 (cirrus) and 11 (snow) are masked out.
export const NDVI_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var sum = s.B08 + s.B04;
  var ndvi = sum === 0 ? 0 : (s.B08 - s.B04) / sum;
  var masked = [3, 8, 9, 10, 11].indexOf(s.SCL) !== -1;
  return { ndvi: [ndvi], dataMask: [s.dataMask && !masked && sum !== 0 ? 1 : 0] };
}`;

export const NDVI_IMAGE_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B08", "dataMask"] }], output: { bands: 4 } };
}
const ramp = [
  [-0.2, 0xa50026], [0.0, 0xd73027], [0.2, 0xfdae61], [0.4, 0xfee08b],
  [0.5, 0xd9ef8b], [0.6, 0xa6d96a], [0.7, 0x66bd63], [0.9, 0x1a9850]
];
const visualizer = new ColorRampVisualizer(ramp);
function evaluatePixel(s) {
  var sum = s.B08 + s.B04;
  var ndvi = sum === 0 ? 0 : (s.B08 - s.B04) / sum;
  var rgb = visualizer.process(ndvi);
  return [rgb[0], rgb[1], rgb[2], s.dataMask];
}`;

export interface SentinelConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  tokenUrl: string;
}

export function sentinelConfig(): SentinelConfig | null {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    baseUrl: (process.env.SENTINEL_HUB_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    tokenUrl: process.env.SENTINEL_HUB_TOKEN_URL || DEFAULT_TOKEN_URL,
  };
}

const toNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Parses a Statistical API response into a cloud-free NDVI time series (oldest first). */
export function parseNdviStats(body: unknown): NdviPoint[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  const points: NdviPoint[] = [];
  for (const entry of body.data) {
    if (!isRecord(entry) || !isRecord(entry.interval) || !isRecord(entry.outputs)) continue;
    const ndvi = entry.outputs.ndvi;
    if (!isRecord(ndvi) || !isRecord(ndvi.bands) || !isRecord(ndvi.bands.B0)) continue;
    const stats = ndvi.bands.B0.stats;
    if (!isRecord(stats)) continue;
    const mean = toNumber(stats.mean);
    const sampleCount = toNumber(stats.sampleCount) ?? 0;
    const noData = toNumber(stats.noDataCount) ?? 0;
    const from = typeof entry.interval.from === "string" ? entry.interval.from : null;
    if (mean === null || !from || sampleCount <= 0) continue;
    const coverage = Math.max(0, Math.min(1, (sampleCount - noData) / sampleCount));
    if (coverage <= 0) continue;
    points.push({
      date: from.slice(0, 10),
      mean: round3(mean),
      min: round3(toNumber(stats.min) ?? mean),
      max: round3(toNumber(stats.max) ?? mean),
      coverage: round3(coverage),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Summarises a series: latest mean and change vs. the previous valid observation. */
export function summarizeNdvi(series: NdviPoint[], minCoverage = 0.3): NdviResult {
  const usable = series.filter((p) => p.coverage >= minCoverage);
  if (!usable.length) return { status: "no_data" };
  const latest = usable[usable.length - 1];
  const previous = usable.length > 1 ? usable[usable.length - 2] : null;
  return {
    status: "ok",
    mean: latest.mean,
    latestDate: latest.date,
    change: previous ? round3(latest.mean - previous.mean) : null,
    series: usable,
    imageAvailable: true,
  };
}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(config: SentinelConfig): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sentinel Hub auth failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.access_token !== "string") throw new Error("Sentinel Hub auth: no token");
  const ttl = toNumber(body.expires_in) ?? 300;
  token = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  return token.value;
}

function timeRange(now: Date) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  return { from: from.toISOString(), to: now.toISOString() };
}

const statsCache = new Map<string, { at: number; result: NdviResult }>();

export async function fetchNdvi(cacheKey: string, boundary: GeoPolygon, now = new Date()): Promise<NdviResult> {
  const config = sentinelConfig();
  if (!config) return { status: "not_configured" };
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const res = await fetch(`${config.baseUrl}/api/v1/statistics`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(config)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        bounds: { geometry: boundary, properties: { crs: CRS84 } },
        data: [{ type: "sentinel-2-l2a", dataFilter: { maxCloudCoverage: 60 } }],
      },
      aggregation: {
        timeRange: timeRange(now),
        aggregationInterval: { of: "P5D" },
        evalscript: NDVI_STATS_EVALSCRIPT,
        resx: RES_DEG,
        resy: RES_DEG,
      },
      calculations: { default: {} },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sentinel Hub statistics failed (${res.status})`);
  const result = summarizeNdvi(parseNdviStats(await res.json()));
  statsCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

/** Renders a colour-ramped NDVI PNG for the polygon (latest least-cloudy scene in the window). */
export async function fetchNdviImage(boundary: GeoPolygon, now = new Date()): Promise<ArrayBuffer | null> {
  const config = sentinelConfig();
  if (!config) return null;
  const res = await fetch(`${config.baseUrl}/api/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(config)}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      input: {
        bounds: { geometry: boundary, properties: { crs: CRS84 } },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: { timeRange: timeRange(now), maxCloudCoverage: 30, mosaickingOrder: "leastCC" },
          },
        ],
      },
      output: { width: 256, height: 256, responses: [{ identifier: "default", format: { type: "image/png" } }] },
      evalscript: NDVI_IMAGE_EVALSCRIPT,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sentinel Hub process failed (${res.status})`);
  return res.arrayBuffer();
}
