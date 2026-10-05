"use client";

import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { EASE_FIELD } from "./motion-presets";
import { cx } from "./cx";

interface ConfidenceRingProps {
  /** 0–1 */
  value: number;
  /** Diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Accessible name, e.g. a translated "Confidence". */
  label?: string;
  className?: string;
}

export default function ConfidenceRing({ value, size = 56, strokeWidth = 5, label, className }: ConfidenceRingProps) {
  const locale = useLocale();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const tone = clamped >= 0.75 ? "text-success" : clamped >= 0.5 ? "text-warning" : "text-danger";
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(clamped);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={pct}
      className={cx("relative inline-grid shrink-0 place-items-center", tone, className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-3)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{ duration: 1, ease: EASE_FIELD }}
        />
      </svg>
      <span
        className="absolute font-display font-semibold tabular-nums text-fg"
        style={{ fontSize: Math.max(10, size * 0.24) }}
        aria-hidden
      >
        {pct}
      </span>
    </div>
  );
}
