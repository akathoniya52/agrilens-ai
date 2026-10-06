"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { EASE_FIELD, FadeIn, Skeleton, Stagger, StaggerItem } from "@/components/ui";
import { MapIcon, SproutMark } from "@/components/icons";
import FarmCard from "@/components/farm/FarmCard";
import FarmForm from "@/components/farm/FarmForm";
import WeatherWidget from "@/components/farm/WeatherWidget";
import { farmsApi } from "@/components/farm/api";
import type { FarmDTO } from "@/types/farm";
import { signInUrlForCurrentPage } from "@/lib/client/sign-in";

export default function FarmsPage() {
  const t = useTranslations("farms");
  const tc = useTranslations("common");
  const { status } = useSession();
  const router = useRouter();
  const [farms, setFarms] = useState<FarmDTO[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await farmsApi.list();
      setFarms(res.farms);
      setActiveId(res.activeFarmId);
    } catch {
      toast.error(tc("error"));
      setFarms([]);
    }
  }, [tc]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(signInUrlForCurrentPage());
    if (status !== "authenticated") return;
    let cancelled = false;
    farmsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        setFarms(res.farms);
        setActiveId(res.activeFarmId);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(tc("error"));
        setFarms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, tc]);

  async function setActive(farmId: string) {
    const previous = activeId;
    setActiveId(farmId);
    try {
      await farmsApi.setActive(farmId);
    } catch {
      setActiveId(previous);
      toast.error(tc("error"));
    }
  }

  async function remove(farm: FarmDTO) {
    if (!window.confirm(t("confirmDelete", { name: farm.name }))) return;
    try {
      await farmsApi.remove(farm._id);
      toast.success(t("deleted"));
      await load();
    } catch {
      toast.error(tc("error"));
    }
  }

  const active = farms?.find((f) => f._id === activeId) ?? null;

  if (status !== "authenticated" || !farms) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true">
        <span className="sr-only">{tc("loading")}</span>
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div aria-hidden className="field-rows pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <FadeIn className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-fg sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 max-w-xl text-fg-muted">{t("subtitle")}</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:-translate-y-0.5"
          >
            <SproutMark width={16} height={16} strokeWidth={2.2} />
            {t("add")}
          </button>
        )}
      </FadeIn>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.section
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: EASE_FIELD }}
            className="overflow-hidden"
          >
            <div className="mb-8 rounded-3xl border border-border bg-surface-2 p-5 shadow-raised sm:p-7">
              <h2 className="mb-5 font-display text-lg font-semibold text-fg">{t("add")}</h2>
              <FarmForm
                onCancel={() => setCreating(false)}
                onCreated={(farm) => {
                  setCreating(false);
                  if (!activeId) setActiveId(farm._id);
                  setFarms((prev) => [farm, ...(prev ?? [])]);
                }}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {farms.length === 0 && !creating ? (
        <FadeIn className="flex flex-col items-center rounded-3xl border border-dashed border-border-strong bg-surface-2/60 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <MapIcon width={26} height={26} />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold text-fg">{t("empty")}</h2>
          <p className="mt-2 max-w-md text-fg-muted">{t("emptyHint")}</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-6 min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow"
          >
            {t("add")}
          </button>
        </FadeIn>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Stagger inView={false} className="grid content-start gap-4 md:grid-cols-2">
            {farms.map((farm) => (
              <StaggerItem key={farm._id}>
                <FarmCard
                  farm={farm}
                  active={farm._id === activeId}
                  onSetActive={() => setActive(farm._id)}
                  onDelete={() => remove(farm)}
                />
              </StaggerItem>
            ))}
          </Stagger>
          {active && (
            <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {t("active")} · <span className="text-fg">{active.name}</span>
              </p>
              <WeatherWidget farmId={active._id} hasLocation={!!active.location} />
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
