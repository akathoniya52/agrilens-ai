"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckIcon, CloudRainIcon, SproutMark } from "@/components/icons";
import { cx, Skeleton } from "@/components/ui";
import type { FieldDTO } from "@/types/farm";
import type { NdviResult, SensorSnapshot, YieldEstimate } from "@/types/insights";
import { insightsApi } from "./api";
import Gauge from "./Gauge";
import Sparkline from "./Sparkline";

type Loadable<T> = { fieldId: string; data: T | null; failed: boolean } | null;

function ndviTone(value: number) {
  if (value >= 0.6) return "text-sev-none";
  if (value >= 0.4) return "text-sev-low";
  if (value >= 0.25) return "text-sev-moderate";
  return "text-sev-critical";
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

function NdviSection({ fieldId, state }: { fieldId: string; state: Loadable<NdviResult> }) {
  const t = useTranslations("fieldInsights");
  const format = useFormatter();
  const [showImage, setShowImage] = useState(false);
  const result = state?.fieldId === fieldId ? state : null;

  const data = result?.data ?? null;
  let body: ReactNode;
  if (!result) body = <Skeleton className="h-24 rounded-xl" />;
  else if (!data) body = <Note>{t("ndvi.failed")}</Note>;
  else if (data.status === "not_configured") body = <Note>{t("ndvi.notConfigured")}</Note>;
  else if (data.status === "no_boundary") body = <Note>{t("ndvi.noBoundary")}</Note>;
  else if (data.status === "no_data") body = <Note>{t("ndvi.noData")}</Note>;
  else {
    const { mean, change, latestDate, series } = data;
    const declining = change !== null && change <= -0.05;
    body = (
      <>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className={cx("font-display text-3xl font-bold", ndviTone(mean))}>{mean.toFixed(2)}</div>
            <p className="text-xs text-fg-subtle">
              {t("ndvi.latest", { date: format.dateTime(new Date(latestDate), { day: "numeric", month: "short" }) })}
            </p>
          </div>
          {change !== null && (
            <span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", declining ? "border-danger/40 bg-danger/10 text-danger" : "border-border text-fg-muted")}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change).toFixed(2)}
            </span>
          )}
        </div>
        {declining && (
          <p className="mt-2 text-xs font-medium text-danger">{t("ndvi.declining")}</p>
        )}
        {series.length > 1 && (
          <div className="mt-2">
            <Sparkline label={t("ndvi.chart")} data={series.map((p) => ({ x: p.date, actual: p.mean }))} domain={[0, 1]} />
          </div>
        )}
        <button type="button" onClick={() => setShowImage((v) => !v)} className="mt-2 text-xs font-semibold text-accent hover:underline">
          {showImage ? t("ndvi.hideMap") : t("ndvi.showMap")}
        </button>
        {showImage && (
          <Image
            src={insightsApi.ndviImageUrl(fieldId)}
            alt={t("ndvi.mapAlt")}
            width={256}
            height={256}
            unoptimized
            className="mt-2 aspect-square w-full max-w-64 rounded-xl border border-border bg-surface-3 object-contain"
          />
        )}
      </>
    );
  }
  return (
    <Section title={t("ndvi.title")} icon={<SproutMark width={16} height={16} />}>
      {body}
    </Section>
  );
}

function YieldSection({ fieldId, state }: { fieldId: string; state: Loadable<YieldEstimate> }) {
  const t = useTranslations("fieldInsights");
  const format = useFormatter();
  const result = state?.fieldId === fieldId ? state : null;
  const y = result?.data;
  const harvest = (iso: string) => {
    const date = format.dateTime(new Date(iso), { day: "numeric", month: "short" });
    return t("yield.harvest", { date });
  };

  let body: ReactNode;
  if (!result) body = <Skeleton className="h-16 rounded-xl" />;
  else if (!y) body = <Note>{t("yield.failed")}</Note>;
  else if (y.perHa === null) body = <Note>{t("yield.unknownCrop")}</Note>;
  else {
    body = (
      <>
        <div className="font-display text-2xl font-bold text-fg">
          {y.total !== null && y.low !== null && y.high !== null
            ? t("yield.range", { low: y.low, high: y.high })
            : t("yield.perHa", { value: y.perHa })}
        </div>
        <p className="text-xs text-fg-subtle">
          {t("yield.basis", { perHa: y.perHa })}
          {y.harvestDate && ` · ${harvest(y.harvestDate)}`}
        </p>
        {y.factors.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-fg-muted">
            {y.factors.map((f) => (
              <li key={f.key}>
                {f.label} · ×{f.multiplier.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[0.7rem] uppercase tracking-wide text-warning">
          {t("yield.disclaimer")}
        </p>
      </>
    );
  }
  return (
    <Section title={t("yield.title")} icon={<ChartGlyph />}>
      {body}
    </Section>
  );
}

const ChartGlyph = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

function SensorSection({ fieldId }: { fieldId: string }) {
  const t = useTranslations("fieldInsights");
  const format = useFormatter();
  const [state, setState] = useState<Loadable<SensorSnapshot>>(null);
  const [token, setToken] = useState<{ fieldId: string; token: string; endpoint: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      insightsApi
        .sensors(fieldId)
        .then((data) => !cancelled && setState({ fieldId, data, failed: false }))
        .catch(() => !cancelled && setState({ fieldId, data: null, failed: true }));
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fieldId]);

  const snapshot = state?.fieldId === fieldId ? state.data : null;
  const shownToken = token?.fieldId === fieldId ? token : null;

  async function connect() {
    setBusy(true);
    try {
      const created = await insightsApi.createDeviceToken(fieldId);
      setToken({ fieldId, ...created });
      setState((s) => (s?.data ? { ...s, data: { ...s.data, connected: true } } : s));
    } catch {
      toast.error(t("sensors.tokenFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm(t("sensors.confirmRevoke"))) return;
    setBusy(true);
    try {
      await insightsApi.revokeDeviceToken(fieldId);
      setToken(null);
      setState((s) => (s?.data ? { ...s, data: { ...s.data, connected: false } } : s));
    } catch {
      toast.error(t("sensors.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  const latest = snapshot?.latest;
  const endpoint = shownToken ? `${typeof window === "undefined" ? "" : window.location.origin}${shownToken.endpoint}` : "";

  return (
    <Section title={t("sensors.title")} icon={<CloudRainIcon width={16} height={16} />}>
      {!state ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : latest ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Gauge label={t("sensors.soilMoisture")} value={latest.soilMoisture} min={0} max={100} unit="%" tone="text-info" />
            <Gauge label={t("sensors.temperature")} value={latest.airTemp ?? latest.soilTemp} min={0} max={50} unit="°C" tone="text-warning" />
            <Gauge label={t("sensors.humidity")} value={latest.humidity} min={0} max={100} unit="%" tone="text-accent" />
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            {t("sensors.updated", { time: format.relativeTime(new Date(latest.ts)) })}
          </p>
          {snapshot && snapshot.recent.length > 2 && (
            <Sparkline
              label={t("sensors.chart")}
              data={snapshot.recent.map((r) => ({ x: r.ts, actual: r.soilMoisture }))}
              domain={[0, 100]}
              format={(v) => `${v.toFixed(0)}%`}
              height={64}
            />
          )}
        </>
      ) : (
        <Note>
          {snapshot?.connected
            ? t("sensors.waiting")
            : t("sensors.none")}
        </Note>
      )}

      {shownToken && (
        <div className="mt-3 space-y-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs text-fg">
          <p className="font-semibold">{t("sensors.tokenOnce")}</p>
          <code className="block break-all rounded-lg bg-surface px-2 py-1.5 font-mono">{shownToken.token}</code>
          <code className="block whitespace-pre-wrap break-all rounded-lg bg-surface px-2 py-1.5 font-mono text-fg-muted">
            {`curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer ${shownToken.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"soilMoisture":34,"airTemp":29.5,"humidity":71}'`}
          </code>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={connect} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-3 disabled:opacity-60">
          {snapshot?.connected ? t("sensors.rotate") : t("sensors.connect")}
        </button>
        {snapshot?.connected && (
          <button type="button" disabled={busy} onClick={revoke} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">
            {t("sensors.revoke")}
          </button>
        )}
        {snapshot?.connected && !shownToken && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckIcon width={14} height={14} />
            {t("sensors.connected")}
          </span>
        )}
      </div>
    </Section>
  );
}

export default function FieldInsights({ field }: { field: FieldDTO }) {
  const [ndvi, setNdvi] = useState<Loadable<NdviResult>>(null);
  const [estimate, setEstimate] = useState<Loadable<YieldEstimate>>(null);
  const fieldId = field._id;
  const boundaryKey = JSON.stringify(field.boundary?.coordinates ?? null);

  useEffect(() => {
    let cancelled = false;
    insightsApi
      .ndvi(fieldId)
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setNdvi({ fieldId, data, failed: data === null });
        const mean = data?.status === "ok" ? data.mean : null;
        return insightsApi.yield(fieldId, mean).then(
          (y) => !cancelled && setEstimate({ fieldId, data: y, failed: false }),
          () => !cancelled && setEstimate({ fieldId, data: null, failed: true })
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fieldId, boundaryKey, field.crop, field.sowingDate, field.areaHa]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <NdviSection fieldId={fieldId} state={ndvi} />
      <div className="space-y-3">
        <YieldSection fieldId={fieldId} state={estimate} />
      </div>
      <div className="md:col-span-2">
        <SensorSection fieldId={fieldId} />
      </div>
    </div>
  );
}
