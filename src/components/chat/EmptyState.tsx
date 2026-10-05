"use client";

import { useTranslations } from "next-intl";
import { ArrowRightIcon, CameraIcon, SproutMark } from "@/components/icons";
import { FadeIn, GlowCard, Stagger, StaggerItem } from "@/components/ui";
import { ScanIcon } from "./icons";

const PROMPT_KEYS = ["q1", "q2", "q3", "q4"] as const;

export default function EmptyState({ onScan, onPrompt }: { onScan: () => void; onPrompt: (text: string) => void }) {
  const t = useTranslations("chat");

  return (
    <div className="relative flex min-h-full flex-col justify-center py-6 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-72 overflow-hidden opacity-50 [mask-image:radial-gradient(60%_70%_at_50%_30%,black,transparent)]">
        <div className="aurora" />
        <div className="field-rows absolute inset-0" />
      </div>

      <FadeIn className="relative">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent ring-1 ring-accent/30 animate-sway">
          <SproutMark width={26} height={26} strokeWidth={2} />
        </span>
        <h1 className="max-w-xl font-display text-3xl font-semibold leading-[1.1] text-fg sm:text-4xl">{t("emptyTitle")}</h1>
        <p className="mt-3 max-w-lg text-base text-fg-muted">{t("emptySubtitle")}</p>
      </FadeIn>

      <FadeIn delay={0.12} className="relative mt-7">
        <GlowCard className="rounded-3xl">
          <button type="button" onClick={onScan} className="group flex w-full items-center gap-4 p-4 text-left sm:p-5">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent text-accent-fg shadow-glow">
              <ScanIcon width={26} height={26} strokeWidth={2} />
              <span aria-hidden className="chat-scanline absolute inset-x-0 top-0 h-6 opacity-70" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold text-fg">{t("scanLeaf")}</span>
              <span className="mt-0.5 block text-sm text-fg-subtle">{t("scanLeafHint")}</span>
            </span>
            <CameraIcon className="hidden shrink-0 text-fg-subtle transition-colors group-hover:text-accent sm:block" />
          </button>
        </GlowCard>
      </FadeIn>

      <p className="relative mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{t("tryAsking")}</p>
      <Stagger inView={false} delay={0.2} stagger={0.06} className="relative grid gap-2 sm:grid-cols-2">
        {PROMPT_KEYS.map((key) => (
          <StaggerItem key={key} y={10}>
            <button
              type="button"
              onClick={() => onPrompt(t(`suggested.${key}`))}
              className="group flex h-full min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2/70 px-4 py-3 text-left text-sm text-fg-muted backdrop-blur transition hover:border-accent/50 hover:text-fg"
            >
              {t(`suggested.${key}`)}
              <ArrowRightIcon width={15} height={15} className="shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
