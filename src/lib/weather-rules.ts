import type { BlightRisk, DayCriteria, HourlyPoint, SprayWindow } from "@/types/farm";

/** Hutton criteria thresholds (UK late-blight warning system, simplified). */
export const HUTTON = { minTempC: 10, humidRh: 90, humidHours: 6, consecutiveDays: 2 } as const;

export const SPRAY = { maxWindKmh: 15, minTempC: 10, maxTempC: 30, rainFreeHours: 6, rainMm: 0.1, minHours: 2 } as const;

const HOUR_MS = 3_600_000;

function groupByDay(hourly: HourlyPoint[]): Map<string, HourlyPoint[]> {
  const days = new Map<string, HourlyPoint[]>();
  for (const point of hourly) {
    const date = point.time.slice(0, 10);
    const bucket = days.get(date);
    if (bucket) bucket.push(point);
    else days.set(date, [point]);
  }
  return days;
}

export function isLeafWet(point: Pick<HourlyPoint, "rh" | "precip">): boolean {
  return point.rh >= HUTTON.humidRh || point.precip > SPRAY.rainMm;
}

export function dayCriteria(hourly: HourlyPoint[]): DayCriteria[] {
  return [...groupByDay(hourly)].map(([date, points]) => {
    const minTemp = Math.min(...points.map((p) => p.temp));
    const humidHours = points.filter((p) => p.rh >= HUTTON.humidRh).length;
    return {
      date,
      minTemp,
      humidHours,
      qualifies: minTemp >= HUTTON.minTempC && humidHours >= HUTTON.humidHours,
    };
  });
}

/**
 * Late-blight risk from a Hutton period: two consecutive days where the minimum temperature is
 * ≥ 10 °C and relative humidity is ≥ 90 % for at least 6 hours.
 * high = a full period occurs, moderate = a single qualifying day, low = none.
 */
export function blightRisk(hourly: HourlyPoint[]): BlightRisk {
  const days = dayCriteria(hourly);
  let run = 0;
  let periodStart: string | null = null;
  for (let i = 0; i < days.length; i++) {
    run = days[i].qualifies ? run + 1 : 0;
    if (run >= HUTTON.consecutiveDays) {
      periodStart = days[i - HUTTON.consecutiveDays + 1].date;
      break;
    }
  }
  const level = periodStart ? "high" : days.some((d) => d.qualifies) ? "moderate" : "low";
  return { level, periodStart, days };
}

function isSprayable(hourly: HourlyPoint[], i: number): boolean {
  const point = hourly[i];
  if (point.wind >= SPRAY.maxWindKmh) return false;
  if (point.temp < SPRAY.minTempC || point.temp > SPRAY.maxTempC) return false;
  const ahead = hourly.slice(i, i + SPRAY.rainFreeHours + 1);
  if (ahead.length < SPRAY.rainFreeHours + 1) return false;
  return ahead.every((p) => p.precip <= SPRAY.rainMm);
}

/**
 * Contiguous hours suitable for spraying: wind < 15 km/h, 10–30 °C and no rain in the
 * following 6 hours. Hours before `now` are ignored; windows shorter than `minHours` are dropped.
 */
export function sprayWindows(
  hourly: HourlyPoint[],
  { now = Date.now(), minHours = SPRAY.minHours }: { now?: number; minHours?: number } = {}
): SprayWindow[] {
  const windows: SprayWindow[] = [];
  let run: HourlyPoint[] = [];

  const flush = () => {
    if (run.length >= minHours) {
      const first = run[0];
      const last = run[run.length - 1];
      windows.push({
        start: first.time,
        end: last.time,
        startTs: first.ts,
        endTs: last.ts + HOUR_MS,
        hours: run.length,
        avgWind: Math.round((run.reduce((s, p) => s + p.wind, 0) / run.length) * 10) / 10,
        avgTemp: Math.round((run.reduce((s, p) => s + p.temp, 0) / run.length) * 10) / 10,
      });
    }
    run = [];
  };

  hourly.forEach((point, i) => {
    const contiguous = run.length === 0 || point.ts - run[run.length - 1].ts === HOUR_MS;
    if (!contiguous) flush();
    if (point.ts + HOUR_MS > now && isSprayable(hourly, i)) run.push(point);
    else flush();
  });
  flush();
  return windows;
}
