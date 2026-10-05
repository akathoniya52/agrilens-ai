"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { ConfidenceRing, EASE_FIELD, SeverityMeter, cx } from "@/components/ui";
import { SproutMark } from "@/components/icons";
import type { Attachment, Diagnosis, Severity } from "@/types/chat";
import BoundingBoxOverlay from "./BoundingBoxOverlay";

const BOX_TONE: Record<Severity, string> = {
  none: "border-sev-none text-sev-none",
  low: "border-sev-low text-sev-low",
  moderate: "border-sev-moderate text-sev-moderate",
  high: "border-sev-high text-sev-high",
  critical: "border-sev-critical text-sev-critical",
};

const AREA_FILL: Record<Severity, string> = {
  none: "bg-sev-none",
  low: "bg-sev-low",
  moderate: "bg-sev-moderate",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};

export default function DiagnosisCard({ diagnosis, image }: { diagnosis: Diagnosis; image?: Attachment }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const area = Math.min(100, Math.max(0, diagnosis.affectedAreaPct || 0));
  const areaLabel = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(area);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_FIELD }}
      aria-label={t("diagnosis")}
      className="relative mb-4 overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-raised"
    >
      <span aria-hidden className="field-rows pointer-events-none absolute inset-0 opacity-60" />
      <header className="relative flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <SproutMark width={14} height={14} strokeWidth={2.2} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{t("diagnosis")}</span>
        <SeverityMeter severity={diagnosis.severity} className="ml-auto" />
      </header>

      <div className={cx("relative grid gap-4 p-4", image && "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]")}>
        {image && (
          <BoundingBoxOverlay
            image={image}
            boxes={diagnosis.boxes}
            alt={t("diagnosedImage")}
            toneClass={BOX_TONE[diagnosis.severity]}
          />
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{diagnosis.crop || t("crop")}</p>
              <h3 className="mt-0.5 font-display text-xl font-semibold leading-tight text-fg [overflow-wrap:anywhere]">
                {diagnosis.condition}
              </h3>
            </div>
            <ConfidenceRing value={diagnosis.confidence} size={60} label={t("confidence")} />
          </div>

          <SeverityMeter severity={diagnosis.severity} variant="bar" />

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-fg-subtle">{t("affectedArea")}</span>
              <span className="font-display text-sm font-semibold tabular-nums text-fg">{areaLabel}%</span>
            </div>
            <div
              role="meter"
              aria-label={t("affectedArea")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(area)}
              className="h-2 overflow-hidden rounded-full bg-surface-3"
            >
              <motion.span
                className={cx("block h-full origin-left rounded-full", AREA_FILL[diagnosis.severity])}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: area / 100 }}
                transition={{ duration: 0.9, delay: 0.2, ease: EASE_FIELD }}
              />
            </div>
          </div>

          {diagnosis.boxes.length > 0 && (
            <p className="text-xs text-fg-subtle">{t("detections", { count: diagnosis.boxes.length })}</p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
