import type { MarketResult, PricePoint, PriceTrend } from "@/types/insights";

export interface MandiRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  /** YYYY-MM-DD */
  date: string;
  min: number;
  max: number;
  modal: number;
}

const DAY_MS = 86_400_000;

function field(raw: Record<string, unknown>, name: string): unknown {
  if (name in raw) return raw[name];
  const hit = Object.keys(raw).find((k) => k.toLowerCase() === name);
  return hit ? raw[hit] : undefined;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function price(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** data.gov.in dates are DD/MM/YYYY; also accepts ISO. */
export function parseMandiDate(value: unknown): string | null {
  const s = text(value);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

export function parseMandiRecords(body: unknown): MandiRecord[] {
  if (typeof body !== "object" || body === null || !("records" in body) || !Array.isArray(body.records)) return [];
  const out: MandiRecord[] = [];
  for (const raw of body.records as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const date = parseMandiDate(field(r, "arrival_date"));
    const modal = price(field(r, "modal_price"));
    if (!date || modal === null) continue;
    out.push({
      state: text(field(r, "state")),
      district: text(field(r, "district")),
      market: text(field(r, "market")),
      commodity: text(field(r, "commodity")),
      variety: text(field(r, "variety")),
      date,
      modal,
      min: price(field(r, "min_price")) ?? modal,
      max: price(field(r, "max_price")) ?? modal,
    });
  }
  return out;
}

/**
 * Puts rows read newest-first under a row cap back into date order. When the cap was hit, the oldest day was
 * probably cut short, so it's dropped rather than averaged over a partial set of markets.
 */
export function recentHistory<T extends { date: string }>(newestFirst: readonly T[], limit: number): T[] {
  const rows = [...newestFirst].reverse();
  if (newestFirst.length < limit) return rows;
  const complete = rows.filter((r) => r.date !== rows[0].date);
  return complete.length ? complete : rows;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Averages all markets per day (oldest first). */
export function dailySeries(records: MandiRecord[]): PricePoint[] {
  const byDate = new Map<string, MandiRecord[]>();
  for (const r of records) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      modal: round(list.reduce((s, r) => s + r.modal, 0) / list.length),
      min: Math.min(...list.map((r) => r.min)),
      max: Math.max(...list.map((r) => r.max)),
      markets: list.length,
    }));
}

/** Ordinary least squares y = a + b·x. */
export function linearFit(xs: number[], ys: number[]): { intercept: number; slope: number } | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export function computeTrend(series: PricePoint[], { window = 7, horizon = 7 } = {}): PriceTrend {
  const flat: PriceTrend = { direction: "flat", slopePerDay: 0, changePct: null, movingAverage: null, forecast: [] };
  if (!series.length) return flat;

  const recent = series.slice(-window);
  const movingAverage = round(recent.reduce((s, p) => s + p.modal, 0) / recent.length);
  const first = series[0];
  const last = series[series.length - 1];
  const changePct = series.length > 1 && first.modal > 0 ? round(((last.modal - first.modal) / first.modal) * 100) : null;

  const t0 = Date.parse(first.date);
  const xs = series.map((p) => (Date.parse(p.date) - t0) / DAY_MS);
  const fit = linearFit(xs, series.map((p) => p.modal));
  if (!fit) return { ...flat, movingAverage, changePct };

  const lastX = xs[xs.length - 1];
  const forecast = Array.from({ length: horizon }, (_, i) => {
    const x = lastX + i + 1;
    return {
      date: new Date(t0 + x * DAY_MS).toISOString().slice(0, 10),
      modal: round(Math.max(0, fit.intercept + fit.slope * x)),
    };
  });
  // Treat moves under 0.2 %/day of the average price as noise.
  const threshold = movingAverage * 0.002;
  const direction = fit.slope > threshold ? "up" : fit.slope < -threshold ? "down" : "flat";
  return { direction, slopePerDay: round(fit.slope), changePct, movingAverage, forecast };
}

/** `stale`: the live data.gov.in fetch failed, so only stored history is shown. */
export type MarketResponse = MarketResult & { stale: boolean };

const recordKey = (r: MandiRecord) => [r.state, r.district, r.market, r.variety, r.date].join("|").toLowerCase();

/** Merges stored history with the live fetch (live wins); `live` is null when the fetch failed. */
export function summarizeMarket(
  commodity: string,
  scope: { state?: string | null; district?: string | null },
  stored: MandiRecord[],
  live: MandiRecord[] | null
): MarketResponse {
  const stale = live === null;
  const merged = new Map<string, MandiRecord>();
  for (const r of [...stored, ...(live ?? [])]) merged.set(recordKey(r), r);
  const records = [...merged.values()];
  if (!records.length) return { status: "no_data", commodity, stale };

  const series = dailySeries(records);
  const latest = series[series.length - 1] ?? null;
  const markets = records
    .filter((r) => r.date === latest?.date)
    .sort((a, b) => b.modal - a.modal)
    .slice(0, 8)
    .map((r) => ({ market: r.market, district: r.district, modal: r.modal, date: r.date }));

  return {
    status: "ok",
    commodity,
    state: scope.state ?? null,
    district: scope.district ?? null,
    latest,
    series,
    trend: computeTrend(series),
    markets,
    stale,
  };
}
