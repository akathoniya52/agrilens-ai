"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { EASE_FIELD, VIEWPORT_ONCE } from "./motion-presets";

interface StaggerProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "whileInView" | "variants"> {
  /** Seconds between children. */
  stagger?: number;
  delay?: number;
  /** Reveal when scrolled into view (default) or immediately on mount. */
  inView?: boolean;
}

export function Stagger({ stagger = 0.08, delay = 0, inView = true, viewport, ...rest }: StaggerProps) {
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { ...VIEWPORT_ONCE, ...viewport } } : { animate: "show" })}
      {...rest}
    />
  );
}

interface StaggerItemProps extends Omit<HTMLMotionProps<"div">, "variants"> {
  y?: number;
}

export function StaggerItem({ y = 20, ...rest }: StaggerItemProps) {
  const variants: Variants = {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_FIELD } },
  };
  return <motion.div variants={variants} {...rest} />;
}

export default Stagger;
