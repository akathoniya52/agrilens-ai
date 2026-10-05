"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { EASE_FIELD, VIEWPORT_ONCE } from "./motion-presets";

interface FadeInProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "whileInView"> {
  delay?: number;
  duration?: number;
  /** Vertical offset in px to rise from. */
  y?: number;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
}

export default function FadeIn({
  delay = 0,
  duration = 0.6,
  y = 16,
  inView = false,
  transition,
  viewport,
  ...rest
}: FadeInProps) {
  const visible = { opacity: 1, y: 0 };
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      {...(inView ? { whileInView: visible, viewport: { ...VIEWPORT_ONCE, ...viewport } } : { animate: visible })}
      transition={{ duration, delay, ease: EASE_FIELD, ...transition }}
      {...rest}
    />
  );
}
