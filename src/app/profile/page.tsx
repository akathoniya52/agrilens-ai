"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { getJson, type Me, type Stats } from "@/components/account";
import { AnimatedCounter, FadeIn, GlowCard, Panel, Skeleton, Stagger, StaggerItem } from "@/components/ui";
import { ArrowRightIcon, CameraIcon, ChartIcon, ChatIcon, GearIcon, SproutMark, UserIcon } from "@/components/icons";
import { getLanguage } from "@/lib/languages";

const USAGE = [
  { key: "chats", field: "totalChats", Icon: ChatIcon },
  { key: "questions", field: "userMessages", Icon: UserIcon },
  { key: "answers", field: "assistantMessages", Icon: SproutMark },
  { key: "diagnoses", field: "diagnoses", Icon: CameraIcon },
] as const;

export default function ProfilePage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const format = useFormatter();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status !== "authenticated") return;
    let cancelled = false;
    Promise.all([getJson<Me>("/api/me"), getJson<Stats>("/api/stats")])
      .then(([meRes, statsRes]) => {
        if (cancelled) return;
        setMe(meRes);
        setStats(statsRes);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, t]);

  if (status !== "authenticated" || !session) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true">
        <span className="sr-only">{tc("loading")}</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-52 rounded-3xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </main>
    );
  }

  const name = me?.name ?? session.user?.name ?? "";
  const email = me?.email ?? session.user?.email ?? "";
  const image = me?.image ?? session.user?.image;
  const credits = stats?.credits ?? me?.credits ?? session.credits;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <FadeIn className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-fg sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 text-fg-muted">{t("subtitle")}</p>
        </div>
        <Link
          href="/chat"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-3"
        >
          <ChatIcon width={16} height={16} />
          {t("backToChat")}
        </Link>
      </FadeIn>

      {/* Identity */}
      <FadeIn delay={0.05}>
        <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface-2 p-6 shadow-raised sm:p-8">
          <div aria-hidden className="field-rows absolute inset-0 -z-10 opacity-70" />
          <div aria-hidden className="absolute -right-24 -top-24 -z-10 h-64 w-64 rounded-full bg-accent-soft blur-3xl" />
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl ring-2 ring-accent/50 ring-offset-4 ring-offset-surface-2 sm:h-28 sm:w-28">
              {image ? (
                <Image src={image} alt="" fill sizes="112px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-accent font-display text-4xl font-bold text-accent-fg">
                  {name.charAt(0).toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-2xl font-semibold text-fg sm:text-3xl">{name}</h2>
              <p className="mt-1 truncate text-fg-muted">{email}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-accent">
                  <SproutMark width={14} height={14} strokeWidth={2.2} />
                  {t("credits")}: {format.number(credits)}
                </span>
                {stats?.memberSince && (
                  <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-fg-muted">
                    {t("memberSince", { date: date(stats.memberSince) })}
                  </span>
                )}
                {stats?.lastActiveAt && (
                  <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-fg-muted">
                    {t("lastActive", { date: date(stats.lastActiveAt) })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Usage */}
      <h2 className="mb-4 mt-10 flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <ChartIcon width={18} height={18} className="text-accent" />
        {t("usage.title")}
      </h2>
      <Stagger inView={false} delay={0.1} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {USAGE.map(({ key, field, Icon }) => (
          <StaggerItem key={key}>
            <GlowCard className="h-full p-5">
              <Icon width={20} height={20} className="text-accent" />
              <div className="mt-4 flex h-10 items-center font-display text-3xl font-bold text-fg sm:text-4xl">
                {stats ? <AnimatedCounter value={stats[field]} duration={1.1} /> : <Skeleton className="h-9 w-16" />}
              </div>
              <p className="mt-1 text-sm text-fg-subtle">{t(`usage.${key}`)}</p>
            </GlowCard>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-10 grid gap-5 lg:grid-cols-5">
        <FadeIn inView className="lg:col-span-3">
          <Panel title={t("account.title")} icon={<UserIcon width={18} height={18} />} className="h-full">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                { label: t("account.name"), value: name },
                { label: t("account.email"), value: email },
                { label: t("account.type"), value: t("account.typeValue") },
                { label: t("account.language"), value: getLanguage(me?.language).nativeLabel },
              ].map(({ label, value }) => (
                <div key={label} className="min-w-0 rounded-2xl border border-border bg-surface px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</dt>
                  <dd className="mt-1 truncate font-medium text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </FadeIn>

        <FadeIn inView delay={0.08} className="lg:col-span-2">
          <Panel title={t("actions.title")} icon={<ArrowRightIcon width={18} height={18} />} className="h-full">
            <div className="flex flex-col gap-3">
              <Link
                href="/chat"
                className="group inline-flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-accent px-5 font-semibold text-accent-fg shadow-glow transition hover:brightness-110"
              >
                {t("actions.newChat")}
                <ArrowRightIcon width={18} height={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/settings"
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-border-strong px-5 font-semibold text-fg transition-colors hover:bg-surface-3"
              >
                <GearIcon width={18} height={18} />
                {t("actions.settings")}
              </Link>
            </div>
          </Panel>
        </FadeIn>
      </div>
    </main>
  );
}
