"use client";

import { motion } from "motion/react";
import { cx } from "./cx";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; pair with a visible label via aria-labelledby when possible. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

export default function Switch({ checked, onChange, label, labelledBy, describedBy, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("group flex h-11 w-16 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <span
        className={cx(
          "flex h-7 w-12 items-center rounded-full border p-0.5 transition-colors duration-200",
          checked ? "justify-end border-accent bg-accent" : "justify-start border-border-strong bg-surface-3"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 36 }}
          className={cx("h-5.5 w-5.5 rounded-full shadow-sm", checked ? "bg-accent-fg" : "bg-fg-subtle")}
        />
      </span>
    </button>
  );
}
