import { MarketPrice } from "@/lib/models/MarketPrice";
import { computeTrend, dailySeries, parseMandiRecords, type MandiRecord } from "@/lib/market-trend";
import type { MarketResult } from "@/types/insights";

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const API_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const HISTORY_DAYS = 60;
const REVALIDATE_SECONDS = 6 * 60 * 60;

export interface MarketQuery {
  commodity: string;
  state?: string | null;
  district?: string | null;
}

export const marketConfigured = () => Boolean(process.env.DATA_GOV_IN_API_KEY);

const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function fetchLive({ commodity, state, district }: MarketQuery): Promise<MandiRecord[]> {
  const params = new URLSearchParams({
    "api-key": process.env.DATA_GOV_IN_API_KEY ?? "",
    format: "json",
    limit: "500",
    "filters[commodity]": titleCase(commodity),
  });
  if (state) params.set("filters[state]", titleCase(state));
  if (district) params.set("filters[district]", titleCase(district));
  const res = await fetch(`${API_URL}?${params}`, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`data.gov.in request failed (${res.status})`);
  return parseMandiRecords(await res.json());
}

async function persist(records: MandiRecord[]) {
  if (!records.length) return;
  await MarketPrice.bulkWrite(
    records.map((r) => ({
      updateOne: {
        filter: {
          commodity: r.commodity.toLowerCase(),
          state: r.state,
          district: r.district,
          market: r.market,
          variety: r.variety,
          date: new Date(`${r.date}T00:00:00Z`),
        },
        update: { $set: { min: r.min, max: r.max, modal: r.modal } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

async function history({ commodity, state, district }: MarketQuery, now: Date): Promise<MandiRecord[]> {
  const filter: Record<string, unknown> = {
    commodity: commodity.trim().toLowerCase(),
    date: { $gte: new Date(now.getTime() - HISTORY_DAYS * 86_400_000) },
  };
  const ci = (value: string) => new RegExp(`^${value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (state) filter.state = ci(state);
  if (district) filter.district = ci(district);
  const rows = await MarketPrice.find(filter).sort({ date: 1 }).limit(5000).lean();
  return rows.map((r) => ({
    commodity: r.commodity,
    state: r.state,
    district: r.district,
    market: r.market,
    variety: r.variety,
    date: r.date.toISOString().slice(0, 10),
    min: r.min,
    max: r.max,
    modal: r.modal,
  }));
}

const recordKey = (r: MandiRecord) => [r.state, r.district, r.market, r.variety, r.date].join("|").toLowerCase();

export async function getMarketPrices(query: MarketQuery, now = new Date()): Promise<MarketResult> {
  const commodity = titleCase(query.commodity);
  if (!marketConfigured()) return { status: "not_configured", commodity };

  const live = await fetchLive(query);
  await persist(live).catch((error: unknown) => console.error("AgriLens market snapshot failed:", error));
  const stored = await history(query, now).catch((error: unknown) => {
    console.error("AgriLens market history failed:", error);
    return [];
  });

  const merged = new Map<string, MandiRecord>();
  for (const r of [...stored, ...live]) merged.set(recordKey(r), r);
  const records = [...merged.values()];
  if (!records.length) return { status: "no_data", commodity };

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
    state: query.state ?? null,
    district: query.district ?? null,
    latest,
    series,
    trend: computeTrend(series),
    markets,
  };
}
