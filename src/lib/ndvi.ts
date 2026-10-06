import type { GeoPolygon } from "@/types/farm";
import type { NdviPoint, NdviResult } from "@/types/insights";

const DEFAULT_BASE_URL = "https://sh.dataspace.copernicus.eu";
const DEFAULT_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;
const DAY_MS = 86_400_000;
const CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
/** ~10 m in degrees (Sentinel-2 red/NIR native resolution). */
const RES_DEG = 0.0001;
const REQUEST_TIMEOUT_MS = 15_000;
/** Highest tile cloud cover (%) a scene may have to be used for the heatmap. */
const IMAGE_MAX_CLOUD = 30;
const CATALOG_MAX_LIMIT = 100;

/** SCL classes treated as no data: 0 no data, 1 saturated/defective, 3 cloud shadow, 8–9 cloud, 10 cirrus, 11 snow. */
export const SCL_MASKED_CLASSES = [0, 1, 3, 8, 9, 10, 11];

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
var MASKED = [${SCL_MASKED_CLASSES.join(", ")}];
function evaluatePixel(s) {
  var sum = s.B08 + s.B04;
  var ndvi = sum === 0 ? 0 : (s.B08 - s.B04) / sum;
  var masked = MASKED.indexOf(s.SCL) !== -1;
  return { ndvi: [ndvi], dataMask: [s.dataMask && !masked && sum !== 0 ? 1 : 0] };
}`;

export const NDVI_IMAGE_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }], output: { bands: 4 } };
}
const ramp = [
  [-0.2, 0xa50026], [0.0, 0xd73027], [0.2, 0xfdae61], [0.4, 0xfee08b],
  [0.5, 0xd9ef8b], [0.6, 0xa6d96a], [0.7, 0x66bd63], [0.9, 0x1a9850]
];
const visualizer = new ColorRampVisualizer(ramp);
var MASKED = [${SCL_MASKED_CLASSES.join(", ")}];
function evaluatePixel(s) {
  var sum = s.B08 + s.B04;
  if (!s.dataMask || sum === 0 || MASKED.indexOf(s.SCL) !== -1) return [0, 0, 0, 0];
  var rgb = visualizer.process((s.B08 - s.B04) / sum);
  return [rgb[0], rgb[1], rgb[2], 1];
}`;

/** `sceneDate`: YYYY-MM-DD of the scene the heatmap shows; null when it couldn't be looked up. */
export type NdviResponse =
  | Exclude<NdviResult, { status: "ok" }>
  | (Extract<NdviResult, { status: "ok" }> & { sceneDate: string | null });

export interface NdviImage {
  png: ArrayBuffer;
  sceneDate: string;
}

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

/** Newest date in a Catalog API `distinct: "date"` search response. */
export function latestCatalogDate(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.features)) return null;
  const dates = body.features.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.sort().at(-1) ?? null;
}

/** Whether a YYYY-MM-DD day overlaps the lookback window that ends at `now`. */
export function inLookbackWindow(date: string, now = new Date()): boolean {
  const start = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(start) && start <= now.getTime() && start + DAY_MS > now.getTime() - LOOKBACK_DAYS * DAY_MS;
}

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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Sentinel Hub auth failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.access_token !== "string") throw new Error("Sentinel Hub auth: no token");
  const ttl = toNumber(body.expires_in) ?? 300;
  token = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  return token.value;
}

async function sentinelPost(config: SentinelConfig, path: string, body: unknown, accept = "application/json") {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(config)}`, "Content-Type": "application/json", Accept: accept },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Sentinel Hub ${path} failed (${res.status})`);
  return res;
}

function timeRange(now: Date) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  return { from: from.toISOString(), to: now.toISOString() };
}

const CACHE_MAX_ENTRIES = 500;

/** Map insertion order is oldest-first, so evicting the first key keeps per-instance memory bounded. */
function cacheSet<V>(cache: Map<string, V>, key: string, value: V) {
  cache.delete(key);
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

const sceneCache = new Map<string, { at: number; date: string | null }>();

async function latestSceneDate(cacheKey: string, config: SentinelConfig, boundary: GeoPolygon, now: Date) {
  const cached = sceneCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.date;
  const { from, to } = timeRange(now);
  const res = await sentinelPost(config, "/api/v1/catalog/1.0.0/search", {
    collections: ["sentinel-2-l2a"],
    datetime: `${from}/${to}`,
    intersects: boundary,
    filter: { op: "<=", args: [{ property: "eo:cloud_cover" }, IMAGE_MAX_CLOUD] },
    "filter-lang": "cql2-json",
    distinct: "date",
    limit: CATALOG_MAX_LIMIT,
  });
  const date = latestCatalogDate(await res.json());
  cacheSet(sceneCache, cacheKey, { at: Date.now(), date });
  return date;
}

const statsCache = new Map<string, { at: number; result: NdviResponse }>();

export async function fetchNdvi(cacheKey: string, boundary: GeoPolygon, now = new Date()): Promise<NdviResponse> {
  const config = sentinelConfig();
  if (!config) return { status: "not_configured" };
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const [stats, scene] = await Promise.all([
    sentinelPost(config, "/api/v1/statistics", {
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
    }).then((res): Promise<unknown> => res.json()),
    latestSceneDate(cacheKey, config, boundary, now).then(
      (date) => ({ date }),
      (error: unknown) => {
        console.error("AgriLens NDVI scene lookup failed:", error);
        return null;
      }
    ),
  ]);
  const summary = summarizeNdvi(parseNdviStats(stats));
  // After a failed lookup the map stays available: the image request looks the scene up again.
  const result: NdviResponse =
    summary.status === "ok"
      ? { ...summary, imageAvailable: scene === null || scene.date !== null, sceneDate: scene?.date ?? null }
      : summary;
  cacheSet(statsCache, cacheKey, { at: Date.now(), result });
  return result;
}

/**
 * Colour-ramped NDVI PNG of a single scene: `date` (YYYY-MM-DD) when given, otherwise the most recent acceptable one.
 * Clouds, shadows and no-data pixels are transparent. Null when not configured or there's no acceptable scene.
 */
export async function fetchNdviImage(
  cacheKey: string,
  boundary: GeoPolygon,
  { date, now = new Date() }: { date?: string; now?: Date } = {}
): Promise<NdviImage | null> {
  const config = sentinelConfig();
  if (!config) return null;
  const sceneDate = date ?? (await latestSceneDate(cacheKey, config, boundary, now));
  if (!sceneDate) return null;
  const res = await sentinelPost(
    config,
    "/api/v1/process",
    {
      input: {
        bounds: { geometry: boundary, properties: { crs: CRS84 } },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: { from: `${sceneDate}T00:00:00Z`, to: `${sceneDate}T23:59:59Z` },
              maxCloudCoverage: IMAGE_MAX_CLOUD,
              mosaickingOrder: "mostRecent",
            },
          },
        ],
      },
      output: { width: 256, height: 256, responses: [{ identifier: "default", format: { type: "image/png" } }] },
      evalscript: NDVI_IMAGE_EVALSCRIPT,
    },
    "image/png"
  );
  return { png: await res.arrayBuffer(), sceneDate };
}
