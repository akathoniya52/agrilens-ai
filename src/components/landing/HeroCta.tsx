"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/components/icons";
import { cx } from "@/components/ui";

const primary =
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-6 text-base font-semibold text-accent-fg shadow-glow transition hover:brightness-110 active:scale-[0.98]";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border border-border-strong bg-surface-2/60 px-6 text-base font-semibold text-fg backdrop-blur transition-colors hover:border-accent/60";

export default function HeroCta({ variant = "hero", className }: { variant?: "hero" | "cta"; className?: string }) {
  const t = useTranslations("landing");
  const { status } = useSession();

  if (status === "loading") {
    return <div className={cx("h-12 w-48 animate-pulse rounded-2xl bg-surface-3", className)} aria-hidden />;
  }

  const arrow = <ArrowRightIcon width={18} height={18} className="transition-transform group-hover:translate-x-0.5" />;

  if (status === "authenticated") {
    return (
      <div className={cx("flex", className)}>
        <Link href="/chat" className={primary}>
          {t("ctaChat")}
          {arrow}
        </Link>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-wrap gap-3", className)}>
      <Link href="/auth/signin" className={primary}>
        {variant === "hero" ? t("ctaStart") : t("cta.button")}
        {arrow}
      </Link>
      {variant === "hero" && (
        <Link href="/auth/signin" className={secondary}>
          {t("ctaSignIn")}
        </Link>
      )}
    </div>
  );
}
