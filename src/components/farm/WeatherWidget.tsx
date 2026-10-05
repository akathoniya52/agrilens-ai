"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { cx, EASE_FIELD, Skeleton } from "@/components/ui";
import { CloudRainIcon } from "@/components/icons";
import { weatherGroup } from "@/lib/weather";
import type { RiskLevel, WeatherReport } from "@/types/farm";
import { farmsApi } from "./api";
import WeatherGlyph from "./WeatherGlyph";

const RISK_TONE: Record<RiskLevel, string> = {
  low: "border-sev-none/40 bg-sev-none/12 text-sev-none",
  moderate: "border-sev-moderate/40 bg-sev-moderate/12 text-sev-moderate",
  high: "border-sev-critical/40 bg-sev-critical/12 text-sev-critical",
};

interface WeatherWidgetProps {
  farmId: string;
  hasLocation: boolean;
  className?: string;
}

export default function WeatherWidget({ farmId, hasLocation, className }: WeatherWidgetProps) {
  const t = useTranslations("weather");
  const format = useFormatter();
  const [state, setState] = useState<{ farmId: string; report: WeatherReport | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!hasLocation) return;
    let cancelled = false;
    farmsApi
      .weather(farmId)
      .then((report) => !cancelled && setState({ farmId, report, failed: false }))
      .catch(() => !cancelled && setState({ farmId, report: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [farmId, hasLocation]);

  const shell = cx("relative isolate overflow-hidden rounded-3xl border border-border bg-surface-2 p-5 shadow-raised", className);
  const current = state?.farmId === farmId ? state : null;

  if (!hasLocation || current?.failed) {
    return (
      <section className={shell}>
        <div className="flex items-center gap-3 text-fg-muted">
          <CloudRainIcon width={22} height={22} className="text-info" />
          <p className="text-sm">{hasLocation ? t("unavailable") : t("needLocation")}</p>
        </div>
      </section>
    );
  }

  if (!current?.report) {
    return (
      <section className={shell} aria-busy="true">
        <Skeleton className="h-12 w-32" />
        <div className="mt-5 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  const { current: now, daily, risk, windows } = current.report;
  const group = weatherGroup(now.code);
  const next = windows[0];
  const day = (date: string) => format.dateTime(new Date(`${date}T12:00:00`), { weekday: "short" });
  const time = (ts: number) => format.dateTime(new Date(ts), { weekday: "short", hour: "numeric", minute: "2-digit" });

  return (
    <section className={shell} aria-label={t("title")}>
      <div aria-hidden className="absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-info/10 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <WeatherGlyph group={group} size={52} />
          <div>
            <p className="font-display text-5xl font-bold leading-none text-fg">{Math.round(now.temp)}°</p>
            <p className="mt-1 text-sm text-fg-muted">
              {t(`codes.${group}`)} · {t("feelsLike")} {Math.round(now.apparent)}°
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm">
          <dt className="text-fg-subtle">{t("humidity")}</dt>
          <dd className="font-semibold text-fg">{Math.round(now.rh)}%</dd>
          <dt className="text-fg-subtle">{t("wind")}</dt>
          <dd className="font-semibold text-fg">{Math.round(now.wind)} km/h</dd>
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
        <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5", RISK_TONE[risk.level])}>
          <span className="h-2 w-2 rounded-full bg-current" />
          {t("diseaseRisk")}: {t(`risk.${risk.level}`)}
        </span>
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
            next ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface text-fg-muted"
          )}
        >
          {next
            ? t("nextSprayWindow", { time: time(next.startTs), hours: next.hours })
            : t("noSprayWindow")}
        </span>
      </div>
      {risk.level !== "low" && (
        <p className="mt-2 text-xs text-fg-subtle">
          {t("riskHint")}
        </p>
      )}

      <h3 className="sr-only">{t("forecast")}</h3>
      <ol className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
        {daily.map((d, i) => (
          <motion.li
            key={d.date}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: EASE_FIELD }}
            className={cx(
              "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center",
              risk.days.find((r) => r.date === d.date)?.qualifies ? "border-sev-moderate/40 bg-sev-moderate/8" : "border-border bg-surface"
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{day(d.date)}</span>
            <WeatherGlyph group={weatherGroup(d.code)} size={22} />
            <span className="text-xs font-semibold text-fg">{Math.round(d.tMax)}°</span>
            <span className="text-[11px] text-fg-subtle">{Math.round(d.tMin)}°</span>
            {d.precipSum >= 0.5 && <span className="text-[10px] font-semibold text-info">{d.precipSum.toFixed(0)}mm</span>}
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
