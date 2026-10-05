"use client";

import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/components/icons";
import { Stagger, StaggerItem } from "@/components/ui";

export default function FollowUpChips({ items, onPick }: { items: string[]; onPick: (question: string) => void }) {
  const t = useTranslations("chat");
  if (!items.length) return null;

  return (
    <nav aria-label={t("followUps")} className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{t("followUps")}</p>
      <Stagger inView={false} stagger={0.07} delay={0.15} className="flex flex-wrap gap-2">
        {items.map((question) => (
          <StaggerItem key={question} y={8}>
            <button
              type="button"
              onClick={() => onPick(question)}
              className="group flex min-h-10 items-center gap-2 rounded-2xl border border-border bg-surface-2 px-3.5 py-2 text-left text-sm text-fg-muted transition hover:border-accent/50 hover:bg-accent-soft hover:text-fg active:scale-[0.98]"
            >
              {question}
              <ArrowRightIcon width={14} height={14} className="shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
            </button>
          </StaggerItem>
        ))}
      </Stagger>
    </nav>
  );
}
