"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { Severity } from "@/types/chat";
import { EASE_FIELD } from "./motion-presets";
import { cx } from "./cx";

const LEVELS: Severity[] = ["none", "low", "moderate", "high", "critical"];

// Static class strings so Tailwind can see every token.
const TONE: Record<Severity, { text: string; bg: string; soft: string; border: string }> = {
  none: { text: "text-sev-none", bg: "bg-sev-none", soft: "bg-sev-none/12", border: "border-sev-none/40" },
  low: { text: "text-sev-low", bg: "bg-sev-low", soft: "bg-sev-low/12", border: "border-sev-low/40" },
  moderate: { text: "text-sev-moderate", bg: "bg-sev-moderate", soft: "bg-sev-moderate/12", border: "border-sev-moderate/40" },
  high: { text: "text-sev-high", bg: "bg-sev-high", soft: "bg-sev-high/12", border: "border-sev-high/40" },
  critical: { text: "text-sev-critical", bg: "bg-sev-critical", soft: "bg-sev-critical/12", border: "border-sev-critical/40" },
};

interface SeverityMeterProps {
  severity: Severity;
  /** "chip" for inline badges, "bar" for a labelled 5-step meter. */
  variant?: "chip" | "bar";
  /** Overrides the translated severity name. */
  label?: string;
  className?: string;
}

export default function SeverityMeter({ severity, variant = "chip", label, className }: SeverityMeterProps) {
  const t = useTranslations("chat");
  const tone = TONE[severity];
  const level = LEVELS.indexOf(severity);
  const name = label ?? t(`severity.${severity}`);

  if (variant === "chip") {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
          tone.text,
          tone.soft,
          tone.border,
          className
        )}
      >
        <span className={cx("relative flex h-2 w-2")}>
          {level >= 3 && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-60", tone.bg)} />}
          <span className={cx("relative h-2 w-2 rounded-full", tone.bg)} />
        </span>
        <span className="sr-only">{t("severityLabel")}: </span>
        {name}
      </span>
    );
  }

  return (
    <div className={cx("w-full", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-fg-subtle">{t("severityLabel")}</span>
        <span className={cx("font-semibold", tone.text)}>{name}</span>
      </div>
      <div
        role="meter"
        aria-label={t("severityLabel")}
        aria-valuemin={0}
        aria-valuemax={LEVELS.length - 1}
        aria-valuenow={level}
        aria-valuetext={name}
        className="grid grid-cols-5 gap-1"
      >
        {LEVELS.map((step, i) => (
          <span key={step} className="h-2 overflow-hidden rounded-full bg-surface-3">
            {i <= level && (
              <motion.span
                className={cx("block h-full origin-left rounded-full", TONE[step].bg)}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: EASE_FIELD }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
