"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { FadeIn, Panel, Skeleton, cx } from "@/components/ui";
import { GlobeIcon, ShieldIcon } from "@/components/icons";
import { insightsApi } from "@/components/insights/api";
import OutbreakMapLoader from "@/components/insights/OutbreakMapLoader";
import type { OutbreakResponse } from "@/types/insights";

const RADII = [25, 50, 100, 250] as const;
const WINDOWS = [7, 14, 30, 90] as const;

const SEVERITY_DOT: Record<string, string> = {
  low: "bg-sev-low",
  moderate: "bg-sev-moderate",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};

export default function RadarPage() {
  const t = useTranslations("radar");
  const format = useFormatter();
  const { status } = useSession();
  const router = useRouter();
  const [radiusKm, setRadiusKm] = useState<number>(100);
  const [days, setDays] = useState<number>(30);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [state, setState] = useState<{ key: string; data: OutbreakResponse | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const key = `${radiusKm}|${days}|${point?.lat ?? ""}|${point?.lon ?? ""}`;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status !== "authenticated") return;
    let cancelled = false;
    insightsApi
      .outbreaks({ radiusKm, days, ...(point ?? {}) })
      .then((data) => !cancelled && setState({ key, data }))
      .catch(() => !cancelled && setState({ key, data: null }));
    return () => {
      cancelled = true;
    };
  }, [status, router, key, radiusKm, days, point]);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lon: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }

  const current = state?.key === key ? state : null;
  const data = current?.data ?? null;
  const pill = (active: boolean) =>
    cx("min-h-9 rounded-xl px-3 text-xs font-semibold transition-colors", active ? "bg-accent text-accent-fg" : "border border-border text-fg-muted hover:bg-surface-3");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <FadeIn className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fg sm:text-4xl">{t("title")}</h1>
        <p className="mt-1 text-fg-muted">{t("subtitle")}</p>
      </FadeIn>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("radius")}</span>
        {RADII.map((r) => (
          <button key={r} type="button" onClick={() => setRadiusKm(r)} className={pill(r === radiusKm)} aria-pressed={r === radiusKm}>
            {r} km
          </button>
        ))}
        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("window")}</span>
        {WINDOWS.map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={pill(d === days)} aria-pressed={d === days}>
            {t("days", { days: d })}
          </button>
        ))}
        <button type="button" onClick={locate} disabled={locating} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-xl border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-3 disabled:opacity-60">
          <GlobeIcon width={14} height={14} />
          {locating ? t("locating") : t("useLocation")}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-3xl border border-border shadow-raised">
          <OutbreakMapLoader className="h-[60vh] min-h-[360px] w-full" center={data?.center ?? null} radiusKm={radiusKm} cells={data?.cells ?? []} />
        </div>
        <aside className="space-y-5">
          <Panel title={t("nearby")} icon={<GlobeIcon width={18} height={18} />}>
            {!current ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : !data ? (
              <p className="text-sm text-fg-muted">{t("failed")}</p>
            ) : !data.center ? (
              <p className="text-sm text-fg-muted">{t("needLocation")}</p>
            ) : data.cells.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("empty")}</p>
            ) : (
              <ul className="space-y-2">
                {data.cells.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
                    <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY_DOT[c.severity] ?? "bg-fg-subtle")} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold capitalize text-fg">{c.condition}</p>
                      <p className="text-xs text-fg-subtle">
                        {c.crop && <span className="capitalize">{c.crop} · </span>}
                        {t("farms", { count: c.users })} · {t("reports", { cases: c.cases })} ·{" "}
                        {t("weekOf", { date: format.dateTime(new Date(c.latest), { day: "numeric", month: "short" }) })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <section className="flex gap-3 rounded-3xl border border-border bg-surface-2 p-5 text-sm text-fg-muted">
            <ShieldIcon width={20} height={20} className="shrink-0 text-accent" />
            <p>
              {t("privacy", { k: data?.k ?? 5 })}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
