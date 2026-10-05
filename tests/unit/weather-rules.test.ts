import { describe, expect, it } from "vitest";
import { blightRisk, dayCriteria, sprayWindows } from "@/lib/weather-rules";
import type { HourlyPoint } from "@/types/farm";

const HOUR = 3_600_000;
const START = Date.parse("2026-10-05T00:00:00Z");

/** Builds `days` × 24 hourly points (UTC) with a per-hour override. */
function hours(days: number, at: (i: number) => Partial<HourlyPoint> = () => ({})): HourlyPoint[] {
  return Array.from({ length: days * 24 }, (_, i) => {
    const ts = START + i * HOUR;
    return { time: new Date(ts).toISOString().slice(0, 16), ts, temp: 18, rh: 60, precip: 0, wind: 8, ...at(i) };
  });
}

const humidDay = (i: number, humidHours: number) => ({ rh: i % 24 < humidHours ? 95 : 70 });

describe("blightRisk (Hutton criteria)", () => {
  it("is low when nights are cold or air is dry", () => {
    expect(blightRisk(hours(7)).level).toBe("low");
    expect(blightRisk(hours(7, (i) => ({ ...humidDay(i, 10), temp: i % 24 === 3 ? 8 : 15 }))).level).toBe("low");
  });

  it("is high on two consecutive qualifying days and reports the period start", () => {
    const data = hours(5, (i) => (i >= 48 && i < 96 ? humidDay(i, 6) : {}));
    const risk = blightRisk(data);
    expect(risk.level).toBe("high");
    expect(risk.periodStart).toBe("2026-10-07");
  });

  it("is moderate when qualifying days are not consecutive", () => {
    const data = hours(5, (i) => (Math.floor(i / 24) % 2 === 0 ? humidDay(i, 8) : {}));
    expect(blightRisk(data).level).toBe("moderate");
  });

  it("needs at least 6 humid hours and min temp ≥ 10 °C", () => {
    const [day] = dayCriteria(hours(1, (i) => humidDay(i, 5)));
    expect(day).toMatchObject({ humidHours: 5, qualifies: false, minTemp: 18 });
    const [edge] = dayCriteria(hours(1, (i) => ({ ...humidDay(i, 6), temp: 10 })));
    expect(edge.qualifies).toBe(true);
  });
});

describe("sprayWindows", () => {
  it("returns one long window in calm, dry, mild weather (minus 6h rain look-ahead at the end)", () => {
    const windows = sprayWindows(hours(2), { now: START });
    expect(windows).toHaveLength(1);
    expect(windows[0].hours).toBe(48 - 6);
    expect(windows[0].startTs).toBe(START);
  });

  it("excludes windy, hot and cold hours", () => {
    const data = hours(1, (i) => (i < 6 ? { wind: 20 } : i < 12 ? { temp: 33 } : i < 18 ? { temp: 6 } : {}));
    expect(sprayWindows(data, { now: START })).toEqual([]);
    const windows = sprayWindows(hours(2, (i) => (i < 6 ? { wind: 20 } : {})), { now: START });
    expect(windows[0].start).toBe("2026-10-05T06:00");
  });

  it("blocks the 6 hours before rain", () => {
    const data = hours(2, (i) => (i === 20 ? { precip: 1.2 } : {}));
    const windows = sprayWindows(data, { now: START });
    expect(windows[0].end).toBe("2026-10-05T13:00");
    expect(windows[1].start).toBe("2026-10-05T21:00");
  });

  it("ignores past hours and short windows", () => {
    const data = hours(2, (i) => (i % 3 === 0 ? { wind: 30 } : {}));
    expect(sprayWindows(data, { now: START, minHours: 3 })).toEqual([]);
    expect(sprayWindows(hours(2), { now: START + 10 * HOUR })[0].startTs).toBe(START + 10 * HOUR);
  });
});
