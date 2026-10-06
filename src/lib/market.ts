import { MarketPrice } from "@/lib/models/MarketPrice";
import {
  parseMandiRecords,
  recentHistory,
  summarizeMarket,
  type MandiRecord,
  type MarketResponse,
} from "@/lib/market-trend";

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const API_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const HISTORY_DAYS = 60;
const HISTORY_LIMIT = 5000;
const REVALIDATE_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 8_000;

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
  const res = await fetch(`${API_URL}?${params}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
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
  // Newest first so the cap drops the oldest rows, not the most recent ones.
  const rows = await MarketPrice.find(filter).sort({ date: -1 }).limit(HISTORY_LIMIT).lean();
  const records = rows.map((r) => ({
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
  return recentHistory(records, HISTORY_LIMIT);
}

/** If the live fetch fails, stored history is returned with `stale: true`; it only throws when there's nothing to show. */
export async function getMarketPrices(query: MarketQuery, now = new Date()): Promise<MarketResponse> {
  const commodity = titleCase(query.commodity);
  if (!marketConfigured()) return { status: "not_configured", commodity, stale: false };

  const [live, stored] = await Promise.all([
    fetchLive(query).then(
      (records) => ({ ok: true as const, records }),
      (error: unknown) => ({ ok: false as const, error })
    ),
    history(query, now).catch((error: unknown) => {
      console.error("AgriLens market history failed:", error);
      return [];
    }),
  ]);

  if (live.ok) {
    await persist(live.records).catch((error: unknown) => console.error("AgriLens market snapshot failed:", error));
  } else if (!stored.length) {
    throw live.error;
  } else {
    console.error("AgriLens market live fetch failed; serving stored history:", live.error);
  }

  return summarizeMarket(commodity, query, stored, live.ok ? live.records : null);
}
