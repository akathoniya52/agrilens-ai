"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLocale } from "next-intl";
import { EASE_FIELD } from "./motion-presets";
import { cx } from "./cx";

interface AnimatedCounterProps {
  value: number;
  /** Seconds. */
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Counts up from zero the first time it scrolls into view. */
export default function AnimatedCounter({ value, duration = 1.6, prefix = "", suffix = "", className }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const locale = useLocale();
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const count = useMotionValue(0);
  const display = useTransform(count, (v) => formatter.format(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    if (!inView) return;
    const controls = animate(count, value, { duration, ease: EASE_FIELD });
    return () => controls.stop();
  }, [count, duration, inView, reduce, value]);

  return (
    <span className={cx("tabular-nums", className)}>
      <span className="sr-only">
        {prefix}
        {formatter.format(value)}
        {suffix}
      </span>
      <span aria-hidden>
        {prefix}
        <motion.span ref={ref}>{display}</motion.span>
        {suffix}
      </span>
    </span>
  );
}
