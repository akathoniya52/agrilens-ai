"use client";

import { useTranslations } from "next-intl";
import { WifiOffIcon } from "@/components/icons";
import { cx } from "@/components/ui";

export default function LoadError({ message, onRetry, className }: { message?: string; onRetry: () => void; className?: string }) {
  const tc = useTranslations("common");
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface-2 px-6 py-10 text-center shadow-raised",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/12 text-danger">
        <WifiOffIcon width={22} height={22} />
      </span>
      <p className="max-w-sm text-fg-muted">{message ?? tc("error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:brightness-110 active:scale-[0.98]"
      >
        {tc("retry")}
      </button>
    </div>
  );
}
