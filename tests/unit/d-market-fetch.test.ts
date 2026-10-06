import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const limit = vi.fn(() => ({ lean: async () => rows }));
  const sort = vi.fn(() => ({ limit }));
  return { rows, sort, limit, find: vi.fn(() => ({ sort })), bulkWrite: vi.fn(async () => ({})) };
});

vi.mock("@/lib/models/MarketPrice", () => ({ MarketPrice: { find: db.find, bulkWrite: db.bulkWrite } }));

import { getMarketPrices } from "@/lib/market";

const stored = (date: string, modal: number) => ({
  commodity: "wheat",
  state: "Gujarat",
  district: "Rajkot",
  market: "Rajkot",
  variety: "",
  date: new Date(`${date}T00:00:00Z`),
  min: modal,
  max: modal,
  modal,
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATA_GOV_IN_API_KEY", "secret-key");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.rows.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const now = new Date("2026-09-10T00:00:00Z");

describe("getMarketPrices", () => {
  it("keeps stored history, newest rows first, and marks it stale when the live fetch fails", async () => {
    db.rows.push(stored("2026-09-02", 2500), stored("2026-09-01", 2400));
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    const result = await getMarketPrices({ commodity: "wheat" }, now);

    expect(result).toMatchObject({ status: "ok", stale: true, latest: { date: "2026-09-02", modal: 2500 } });
    expect(result.status === "ok" && result.series.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(db.sort).toHaveBeenCalledWith({ date: -1 });
    expect(db.limit).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(db.bulkWrite).not.toHaveBeenCalled();
  });

  it("throws when the live fetch fails and nothing is stored", async () => {
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(getMarketPrices({ commodity: "wheat" }, now)).rejects.toThrow("data.gov.in request failed (503)");
  });

  it("is not stale when the live fetch succeeds", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        records: [{ state: "Gujarat", district: "Rajkot", market: "Rajkot", commodity: "Wheat", variety: "", arrival_date: "03/09/2026", modal_price: "2550" }],
      })
    );
    const result = await getMarketPrices({ commodity: "wheat" }, now);
    expect(result).toMatchObject({ status: "ok", stale: false, latest: { date: "2026-09-03", modal: 2550 } });
    expect(db.bulkWrite).toHaveBeenCalledOnce();
  });
});
