import { describe, expect, it } from "vitest";
import { computeTrend, dailySeries, linearFit, parseMandiDate, parseMandiRecords } from "@/lib/market-trend";

describe("parseMandiDate", () => {
  it("parses DD/MM/YYYY and ISO", () => {
    expect(parseMandiDate("5/9/2026")).toBe("2026-09-05");
    expect(parseMandiDate("2026-09-05T00:00:00")).toBe("2026-09-05");
    expect(parseMandiDate("yesterday")).toBeNull();
  });
});

describe("parseMandiRecords", () => {
  it("reads data.gov.in records, tolerating capitalised keys and string prices", () => {
    const body = {
      records: [
        { state: "Gujarat", district: "Rajkot", market: "Rajkot", commodity: "Wheat", variety: "Lokwan", arrival_date: "01/09/2026", min_price: "2400", max_price: "2700", modal_price: "2550" },
        { State: "Gujarat", District: "Amreli", Market: "Amreli", Commodity: "Wheat", Variety: "", Arrival_Date: "01/09/2026", Modal_Price: "2450" },
        { arrival_date: "bad", modal_price: "10" },
        { arrival_date: "01/09/2026", modal_price: "0" },
      ],
    };
    const records = parseMandiRecords(body);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ date: "2026-09-01", modal: 2550, min: 2400, max: 2700 });
    expect(records[1]).toMatchObject({ district: "Amreli", modal: 2450, min: 2450, max: 2450 });
    expect(parseMandiRecords(null)).toEqual([]);
  });
});

describe("dailySeries", () => {
  it("averages markets per day, oldest first", () => {
    const base = { state: "", district: "", market: "", commodity: "Wheat", variety: "" };
    const series = dailySeries([
      { ...base, date: "2026-09-02", min: 1, max: 5, modal: 300 },
      { ...base, date: "2026-09-01", min: 1, max: 5, modal: 100 },
      { ...base, date: "2026-09-01", min: 0, max: 9, modal: 200 },
    ]);
    expect(series.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(series[0]).toMatchObject({ modal: 150, min: 0, max: 9, markets: 2 });
  });
});

describe("linearFit / computeTrend", () => {
  it("fits a perfect line", () => {
    expect(linearFit([0, 1, 2], [1, 3, 5])).toEqual({ slope: 2, intercept: 1 });
    expect(linearFit([1, 1], [1, 2])).toBeNull();
  });

  it("detects an upward trend and forecasts forward", () => {
    const series = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      modal: 2000 + i * 20,
      min: 0,
      max: 0,
      markets: 1,
    }));
    const trend = computeTrend(series, { horizon: 3 });
    expect(trend.direction).toBe("up");
    expect(trend.slopePerDay).toBeCloseTo(20);
    expect(trend.forecast).toEqual([
      { date: "2026-09-11", modal: 2200 },
      { date: "2026-09-12", modal: 2220 },
      { date: "2026-09-13", modal: 2240 },
    ]);
    expect(trend.changePct).toBe(9);
  });

  it("is flat for noise and empty input", () => {
    expect(computeTrend([]).direction).toBe("flat");
    const flat = [2000, 2001, 1999, 2000].map((modal, i) => ({ date: `2026-09-0${i + 1}`, modal, min: 0, max: 0, markets: 1 }));
    expect(computeTrend(flat).direction).toBe("flat");
  });
});
