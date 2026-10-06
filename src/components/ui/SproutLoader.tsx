"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useHasMounted } from "@/components/useHasMounted";
import { cx } from "./cx";

interface SproutLoaderProps {
  /** Icon size in px. */
  size?: number;
  /** Visible text beside the sprout. Defaults to none; the accessible label is always set. */
  label?: string;
  className?: string;
}

const CYCLE = 2.6;

/** "Thinking" indicator: a seedling grows inside a soft pulse ring, then resets. */
export default function SproutLoader({ size = 40, label, className }: SproutLoaderProps) {
  const t = useTranslations("chat");
  const prefersReduced = useReducedMotion();
  // Apply reduced motion only after hydration so server and client render the same first frame.
  const reduce = useHasMounted() && prefersReduced === true;
  const loop = { duration: CYCLE, repeat: Infinity, ease: "easeInOut" } as const;

  return (
    <span role="status" aria-label={label ?? t("thinking")} className={cx("inline-flex items-center gap-3 text-accent", className)}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden className="shrink-0 overflow-visible">
        {!reduce &&
          [0, CYCLE / 2].map((delay) => (
            <motion.circle
              key={delay}
              cx="24"
              cy="26"
              r="16"
              stroke="currentColor"
              strokeWidth="1.5"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.35], opacity: [0.55, 0] }}
              transition={{ duration: CYCLE, repeat: Infinity, ease: "easeOut", delay }}
            />
          ))}
        <path d="M12 39h24" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
        <motion.path
          d="M24 39V22"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={false}
          animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1, 1], opacity: [1, 1, 1, 0] }}
          transition={reduce ? { duration: 0 } : { ...loop, times: [0, 0.35, 0.85, 1] }}
        />
        <motion.path
          d="M24 28c-1-5-5-8-10-7 0 5 4 8 10 7z"
          fill="currentColor"
          fillOpacity="0.85"
          style={{ originX: 1, originY: 1 }}
          initial={false}
          animate={reduce ? { scale: 1 } : { scale: [0, 0, 1, 1, 1], opacity: [0, 0, 1, 1, 0] }}
          transition={reduce ? { duration: 0 } : { ...loop, times: [0, 0.3, 0.5, 0.85, 1] }}
        />
        <motion.path
          d="M24 24c1-6 6-9 12-8 0 6-5 9-12 8z"
          fill="currentColor"
          style={{ originX: 0, originY: 1 }}
          initial={false}
          animate={reduce ? { scale: 1 } : { scale: [0, 0, 1, 1, 1], opacity: [0, 0, 1, 1, 0] }}
          transition={reduce ? { duration: 0 } : { ...loop, times: [0, 0.4, 0.6, 0.85, 1] }}
        />
      </svg>
      {label && <span className="text-sm font-medium text-fg-muted">{label}</span>}
    </span>
  );
}
