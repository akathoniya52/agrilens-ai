import type { ReactNode } from "react";
import { cx } from "./cx";

interface PanelProps {
  title: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
  children: ReactNode;
}

/** Titled settings/profile section card. */
export default function Panel({ title, icon, tone = "default", className, children }: PanelProps) {
  const danger = tone === "danger";
  return (
    <section
      className={cx(
        "rounded-3xl border p-5 shadow-raised sm:p-7",
        danger ? "border-danger/35 bg-danger/[0.04]" : "border-border bg-surface-2",
        className
      )}
    >
      <h2 className={cx("mb-5 flex items-center gap-3 font-display text-lg font-semibold", danger ? "text-danger" : "text-fg")}>
        {icon && (
          <span
            className={cx(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              danger ? "bg-danger/12 text-danger" : "bg-accent-soft text-accent"
            )}
          >
            {icon}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A row inside a Panel: label + hint on the left, control on the right. */
export function PanelRow({ id, title, hint, children }: { id?: string; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p id={id ? `${id}-label` : undefined} className="font-medium text-fg">
          {title}
        </p>
        {hint && (
          <p id={id ? `${id}-hint` : undefined} className="mt-0.5 text-sm text-fg-subtle">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
