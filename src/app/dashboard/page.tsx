"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AnimatedCounter, FadeIn, GlowCard, Panel, Skeleton, Stagger, StaggerItem } from "@/components/ui";
import { BellIcon, CameraIcon, ChartIcon, GlobeIcon, MapIcon, SproutMark } from "@/components/icons";
import MarketWidget from "@/components/insights/MarketWidget";
import BeforeAfterSlider from "@/components/dashboard/BeforeAfterSlider";
import { FieldHealthBars, OverTimeChart, SeverityDonut, TopConditionsChart } from "@/components/dashboard/DashboardCharts";
import { getJson } from "@/components/account";
import type { DashboardData } from "@/types/farm";

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-fg-muted">{children}</p>;
}

function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const format = useFormatter();
  const { status } = useSession();
  const router = useRouter();
  const farmId = useSearchParams().get("farmId");
  const [data, setData] = useState<DashboardData | null>(null);
  const [pair, setPair] = useState<{ before: string; after: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status !== "authenticated") return;
    let cancelled = false;
    getJson<DashboardData>(`/api/dashboard${farmId ? `?farmId=${farmId}` : ""}`)
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && toast.error(tc("error")));
    return () => {
      cancelled = true;
    };
  }, [status, router, farmId, tc]);

  const defaultPair = useMemo(() => {
    if (!data) return null;
    const byField = new Map<string, DashboardData["gallery"]>();
    for (const g of data.gallery) {
      const key = g.fieldId ?? "none";
      byField.set(key, [...(byField.get(key) ?? []), g]);
    }
    const group = [...byField.values()].find((list) => list.length >= 2) ?? (data.gallery.length >= 2 ? data.gallery : null);
    return group ? { before: group[group.length - 1]._id, after: group[0]._id } : null;
  }, [data]);

  if (status !== "authenticated" || !data) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true">
        <span className="sr-only">{tc("loading")}</span>
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
      </main>
    );
  }

  const chosen = pair ?? defaultPair;
  const before = data.gallery.find((g) => g._id === chosen?.before);
  const after = data.gallery.find((g) => g._id === chosen?.after);
  const label = (g: DashboardData["gallery"][number]) =>
    `${format.dateTime(new Date(g.createdAt), { day: "numeric", month: "short" })} · ${g.condition || "—"}`;
  const totals = [
    { key: "diagnoses", value: data.totals.diagnoses, Icon: CameraIcon },
    { key: "farms", value: data.totals.farms, Icon: MapIcon },
    { key: "fields", value: data.totals.fields, Icon: SproutMark },
    { key: "openReminders", value: data.totals.openReminders, Icon: BellIcon },
  ] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <FadeIn className="mb-8">
        <h1 className="font-display text-4xl font-bold text-fg sm:text-5xl">{t("title")}</h1>
        <p className="mt-2 text-fg-muted">{t("subtitle")}</p>
      </FadeIn>

      <Stagger inView={false} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {totals.map(({ key, value, Icon }) => (
          <StaggerItem key={key}>
            <GlowCard className="h-full p-5">
              <Icon width={20} height={20} className="text-accent" />
              <div className="mt-4 font-display text-3xl font-bold text-fg sm:text-4xl">
                <AnimatedCounter value={value} duration={1.1} />
              </div>
              <p className="mt-1 text-sm text-fg-subtle">{t(`totals.${key}`)}</p>
            </GlowCard>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-8 grid gap-5 lg:grid-cols-5">
        <FadeIn inView className="lg:col-span-3">
          <Panel title={t("overTime")} icon={<ChartIcon width={18} height={18} />} className="h-full">
            {data.overTime.length ? <OverTimeChart data={data.overTime} /> : <Empty>{t("noActivity")}</Empty>}
          </Panel>
        </FadeIn>
        <FadeIn inView delay={0.05} className="lg:col-span-2">
          <Panel title={t("severityBreakdown")} icon={<ChartIcon width={18} height={18} />} className="h-full">
            {data.totals.diagnoses ? <SeverityDonut data={data.severity} /> : <Empty>{t("noActivity")}</Empty>}
          </Panel>
        </FadeIn>
        <FadeIn inView className="lg:col-span-3">
          <Panel title={t("topIssues")} icon={<CameraIcon width={18} height={18} />} className="h-full">
            {data.topConditions.length ? <TopConditionsChart data={data.topConditions} /> : <Empty>{t("noActivity")}</Empty>}
          </Panel>
        </FadeIn>
        <FadeIn inView delay={0.05} className="lg:col-span-2">
          <Panel title={t("fieldHealth")} icon={<SproutMark width={18} height={18} />} className="h-full">
            {data.fieldHealth.length ? (
              <FieldHealthBars data={data.fieldHealth} />
            ) : (
              <Empty>{t("noFieldHealth")}</Empty>
            )}
          </Panel>
        </FadeIn>
      </div>

      <FadeIn inView className="mt-5">
        <Panel title={t("beforeAfter")} icon={<CameraIcon width={18} height={18} />}>
          {before && after ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <BeforeAfterSlider before={{ src: before.imageUrl, label: label(before) }} after={{ src: after.imageUrl, label: label(after) }} />
              <div className="space-y-4">
                {(["before", "after"] as const).map((slot) => (
                  <label key={slot} className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t(slot)}</span>
                    <select
                      value={chosen?.[slot] ?? ""}
                      onChange={(e) => setPair({ before: chosen?.before ?? "", after: chosen?.after ?? "", [slot]: e.target.value })}
                      className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
                    >
                      {data.gallery.map((g) => (
                        <option key={g._id} value={g._id}>
                          {g.fieldName ? `${g.fieldName} · ` : ""}{label(g)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <Empty>{t("noComparison")}</Empty>
          )}
        </Panel>
      </FadeIn>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <FadeIn inView className="lg:col-span-3">
          <Panel title={t("market")} icon={<ChartIcon width={18} height={18} />} className="h-full">
            <MarketWidget defaultCommodity={data.fieldHealth[0]?.crop} />
          </Panel>
        </FadeIn>
        <FadeIn inView delay={0.05} className="lg:col-span-2">
          <Panel title={t("radarTitle")} icon={<GlobeIcon width={18} height={18} />} className="h-full">
            <p className="text-sm text-fg-muted">
              {t("radarBody")}
            </p>
            <Link href="/radar" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-glow">
              {t("openRadar")}
            </Link>
          </Panel>
        </FadeIn>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10" aria-busy="true" />}>
      <Dashboard />
    </Suspense>
  );
}
