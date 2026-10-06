"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton, cx } from "@/components/ui";
import type { MarketResponse } from "@/lib/market-trend";
import type { MarketResult } from "@/types/insights";
import { insightsApi } from "./api";
import Sparkline from "./Sparkline";

const COMMON = ["Wheat", "Paddy(Dhan)(Common)", "Maize", "Cotton", "Tomato", "Potato", "Onion", "Soyabean", "Mustard", "Gram"];

const withStale = (result: MarketResult): MarketResponse => ({ ...result, stale: "stale" in result && result.stale === true });

interface Query {
  commodity: string;
  state: string;
}

export default function MarketWidget({ defaultCommodity }: { defaultCommodity?: string | null }) {
  const t = useTranslations("market");
  const format = useFormatter();
  const [draft, setDraft] = useState<Query>({ commodity: defaultCommodity || "Wheat", state: "" });
  const [query, setQuery] = useState<Query>(draft);
  const [state, setState] = useState<{ key: string; result: MarketResponse | null } | null>(null);
  const key = `${query.commodity}|${query.state}`;

  useEffect(() => {
    let cancelled = false;
    insightsApi
      .market(query.commodity, query.state || null)
      .then((result) => !cancelled && setState({ key, result: withStale(result) }))
      .catch(() => !cancelled && setState({ key, result: null }));
    return () => {
      cancelled = true;
    };
  }, [key, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.commodity.trim().length >= 2) setQuery({ commodity: draft.commodity.trim(), state: draft.state.trim() });
  }

  const current = state?.key === key ? state : null;
  const result = current?.result ?? null;
  const rupees = (n: number) => format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  let body;
  if (!current) body = <Skeleton className="h-36 rounded-xl" />;
  else if (!result) body = <p className="text-sm text-fg-muted">{t("failed")}</p>;
  else if (result.status === "not_configured") body = <p className="text-sm text-fg-muted">{t("notConfigured")}</p>;
  else if (result.status === "no_data") body = <p className="text-sm text-fg-muted">{t("noData", { commodity: result.commodity })}</p>;
  else {
    const { latest, trend, series, markets, stale } = result;
    const arrow = trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "▬";
    body = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-display text-3xl font-bold text-fg">{latest ? rupees(latest.modal) : "—"}</div>
            <p className="text-xs text-fg-subtle">
              {t("perQuintal", { markets: latest?.markets ?? 0 })}
              {latest && ` · ${format.dateTime(new Date(latest.date), { day: "numeric", month: "short" })}`}
            </p>
          </div>
          <span
            className={cx(
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              trend.direction === "up" && "border-success/40 bg-success/10 text-success",
              trend.direction === "down" && "border-danger/40 bg-danger/10 text-danger",
              trend.direction === "flat" && "border-border text-fg-muted"
            )}
          >
            {arrow} {t(`trend.${trend.direction}`)}
            {trend.changePct !== null && ` · ${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`}
          </span>
        </div>
        {stale && <p className="mt-2 text-xs font-medium text-warning">{t("stale")}</p>}
        {series.length > 1 && (
          <div className="mt-3">
            <Sparkline
              label={t("chart")}
              format={rupees}
              data={[
                ...series.map((p) => ({ x: p.date, actual: p.modal })),
                ...trend.forecast.map((p) => ({ x: p.date, forecast: p.modal })),
              ]}
            />
            <p className="text-[0.7rem] text-fg-subtle">{t("forecastNote")}</p>
          </div>
        )}
        {series.length <= 1 && (
          <p className="mt-2 text-xs text-fg-subtle">{t("buildingHistory")}</p>
        )}
        {markets.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
            {markets.slice(0, 5).map((m) => (
              <li key={`${m.market}-${m.district}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-fg">
                  {m.market}
                  <span className="text-fg-subtle"> · {m.district}</span>
                </span>
                <span className="shrink-0 font-semibold text-fg">{rupees(m.modal)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div>
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input
          list="agrilens-commodities"
          value={draft.commodity}
          onChange={(e) => setDraft((d) => ({ ...d, commodity: e.target.value }))}
          aria-label={t("commodity")}
          placeholder={t("commodity")}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
        />
        <input
          value={draft.state}
          onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
          aria-label={t("state")}
          placeholder={t("state")}
          className="min-h-11 w-40 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
        />
        <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">
          {t("show")}
        </button>
        <datalist id="agrilens-commodities">
          {COMMON.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </form>
      {body}
    </div>
  );
}
