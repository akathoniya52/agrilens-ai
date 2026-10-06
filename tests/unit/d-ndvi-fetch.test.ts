import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNdvi, fetchNdviImage } from "@/lib/ndvi";
import type { GeoPolygon } from "@/types/farm";

const boundary: GeoPolygon = {
  type: "Polygon",
  coordinates: [[[72.5, 23.0], [72.501, 23.0], [72.501, 23.001], [72.5, 23.0]]],
};
const now = new Date("2026-10-06T12:00:00Z");

let sceneDates: string[] = [];
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const url = String(input);
  if (url.endsWith("/token")) return Response.json({ access_token: "token", expires_in: 3600 });
  if (url.endsWith("/api/v1/catalog/1.0.0/search")) return Response.json({ type: "FeatureCollection", features: sceneDates });
  if (url.endsWith("/api/v1/statistics")) {
    const stats = { mean: 0.61, min: 0.2, max: 0.8, sampleCount: 100, noDataCount: 10 };
    return Response.json({ data: [{ interval: { from: "2026-09-28T12:00:00Z" }, outputs: { ndvi: { bands: { B0: { stats } } } } }] });
  }
  if (url.endsWith("/api/v1/process")) return new Response(new Uint8Array([137, 80, 78, 71]));
  return new Response("not found", { status: 404 });
});

const requestTo = (path: string) => {
  const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith(path));
  return call ? JSON.parse(String(call[1]?.body)) : null;
};

beforeEach(() => {
  vi.stubEnv("SENTINEL_HUB_CLIENT_ID", "client");
  vi.stubEnv("SENTINEL_HUB_CLIENT_SECRET", "secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchNdviImage", () => {
  it("renders the most recent acceptable scene with mostRecent mosaicking and the SCL mask", async () => {
    sceneDates = ["2026-09-21", "2026-09-30", "2026-09-26"];
    const image = await fetchNdviImage("field-a", boundary, { now });

    expect(image?.sceneDate).toBe("2026-09-30");
    expect(image?.png.byteLength).toBe(4);
    const search = requestTo("/api/v1/catalog/1.0.0/search");
    expect(search).toMatchObject({ collections: ["sentinel-2-l2a"], distinct: "date", intersects: boundary });
    expect(search.filter).toEqual({ op: "<=", args: [{ property: "eo:cloud_cover" }, 30] });
    const process = requestTo("/api/v1/process");
    expect(process.input.data[0].dataFilter).toEqual({
      timeRange: { from: "2026-09-30T00:00:00Z", to: "2026-09-30T23:59:59Z" },
      maxCloudCoverage: 30,
      mosaickingOrder: "mostRecent",
    });
    expect(process.evalscript).toContain("SCL");
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("renders a requested date without a catalog lookup, and returns null when no scene qualifies", async () => {
    const image = await fetchNdviImage("field-b", boundary, { date: "2026-09-14", now });
    expect(image?.sceneDate).toBe("2026-09-14");
    expect(requestTo("/api/v1/catalog/1.0.0/search")).toBeNull();

    sceneDates = [];
    expect(await fetchNdviImage("field-c", boundary, { now })).toBeNull();
  });
});

describe("fetchNdvi", () => {
  it("adds the heatmap scene date, with every Sentinel Hub call under a timeout", async () => {
    sceneDates = ["2026-10-01"];
    const result = await fetchNdvi("field-d", boundary, now);
    expect(result).toMatchObject({ status: "ok", mean: 0.61, latestDate: "2026-09-28", sceneDate: "2026-10-01", imageAvailable: true });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("hides the map when no scene qualifies but keeps it when the lookup itself fails", async () => {
    sceneDates = [];
    expect(await fetchNdvi("field-e", boundary, now)).toMatchObject({ status: "ok", sceneDate: null, imageAvailable: false });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn<typeof fetch>(async (input, init) =>
      String(input).endsWith("/search") ? new Response("down", { status: 503 }) : fetchMock(input, init)
    );
    vi.stubGlobal("fetch", failing);
    expect(await fetchNdvi("field-f", boundary, now)).toMatchObject({ status: "ok", sceneDate: null, imageAvailable: true });
    vi.restoreAllMocks();
  });
});
