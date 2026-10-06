"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { EASE_FIELD, FadeIn, Panel, Skeleton } from "@/components/ui";
import { BellIcon, ChartIcon, MapIcon, SproutMark } from "@/components/icons";
import CropCalendar from "@/components/farm/CropCalendar";
import FieldInsights from "@/components/insights/FieldInsights";
import FieldForm from "@/components/farm/FieldForm";
import FieldList from "@/components/farm/FieldList";
import FieldMapLoader from "@/components/farm/FieldMapLoader";
import RemindersPanel from "@/components/farm/RemindersPanel";
import WeatherWidget from "@/components/farm/WeatherWidget";
import { farmsApi, fieldsApi, remindersApi, type ReminderInput } from "@/components/farm/api";
import type { FarmDetail, LngLat, ReminderDTO } from "@/types/farm";
import { signInUrlForCurrentPage } from "@/lib/client/sign-in";

type Draft = { ring: LngLat[] | null } | null;

export default function FarmDetailPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = use(params);
  const t = useTranslations("farms");
  const tc = useTranslations("common");
  const { status } = useSession();
  const router = useRouter();
  const [detail, setDetail] = useState<FarmDetail | null>(null);
  const [reminders, setReminders] = useState<ReminderDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Draft>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(signInUrlForCurrentPage());
    if (status !== "authenticated") return;
    let cancelled = false;
    Promise.all([farmsApi.get(farmId), remindersApi.list({ farmId })])
      .then(([farm, list]) => {
        if (cancelled) return;
        setDetail(farm);
        setReminders(list);
        setSelectedId(farm.fields[0]?._id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(tc("error"));
        router.push("/farms");
      });
    return () => {
      cancelled = true;
    };
  }, [status, farmId, router, tc]);

  if (status !== "authenticated" || !detail) {
    return (
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6" aria-busy="true">
        <span className="sr-only">{tc("loading")}</span>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[55vh] rounded-3xl" />
      </main>
    );
  }

  const { farm, fields, diagnoses } = detail;
  const selected = fields.find((f) => f._id === selectedId) ?? null;

  async function createReminders(inputs: ReminderInput[]): Promise<boolean> {
    try {
      const created = await remindersApi.createMany(inputs.map((i) => ({ ...i, farmId })));
      setReminders((prev) => [...prev, ...created].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
      toast.success(t("remindersAdded", { count: created.length }));
      return true;
    } catch {
      toast.error(tc("error"));
      return false;
    }
  }

  async function toggleReminder(reminder: ReminderDTO) {
    setReminders((prev) => prev.map((r) => (r._id === reminder._id ? { ...r, done: !r.done } : r)));
    try {
      await remindersApi.update(reminder._id, { done: !reminder.done });
    } catch {
      setReminders((prev) => prev.map((r) => (r._id === reminder._id ? reminder : r)));
      toast.error(tc("error"));
    }
  }

  async function deleteReminder(reminder: ReminderDTO) {
    setReminders((prev) => prev.filter((r) => r._id !== reminder._id));
    try {
      await remindersApi.remove(reminder._id);
    } catch {
      // Still on the server and still notifying, so put it back.
      setReminders((prev) =>
        prev.some((r) => r._id === reminder._id)
          ? prev
          : [...prev, reminder].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      );
      toast.error(tc("error"));
    }
  }

  async function deleteField(fieldId: string, name: string) {
    if (!window.confirm(t("confirmDeleteField", { name }))) return;
    try {
      await fieldsApi.remove(fieldId);
      setDetail((d) => d && { ...d, fields: d.fields.filter((f) => f._id !== fieldId) });
      setReminders((prev) => prev.filter((r) => r.fieldId !== fieldId));
      if (selectedId === fieldId) setSelectedId(null);
    } catch {
      toast.error(tc("error"));
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <FadeIn className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/farms" className="text-sm font-semibold text-fg-subtle hover:text-accent">← {t("title")}</Link>
          <h1 className="mt-1 truncate font-display text-3xl font-bold text-fg sm:text-4xl">{farm.name}</h1>
          {farm.crops.length > 0 && <p className="mt-1 text-sm capitalize text-fg-muted">{farm.crops.join(" · ")}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard?farmId=${farm._id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-3">
            <ChartIcon width={16} height={16} />
            {t("health")}
          </Link>
          <button
            type="button"
            disabled={drawing || !!draft}
            onClick={() => setDrawing(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-glow disabled:opacity-60"
          >
            <SproutMark width={16} height={16} strokeWidth={2.2} />
            {t("drawField")}
          </button>
        </div>
      </FadeIn>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <FadeIn delay={0.05} className="overflow-hidden rounded-3xl border border-border shadow-raised">
            <FieldMapLoader
              className="h-[52vh] min-h-[340px] w-full"
              center={farm.location?.coordinates ?? null}
              fields={fields}
              pins={diagnoses}
              selectedFieldId={selectedId}
              onSelectField={setSelectedId}
              drawing={drawing}
              onDrawComplete={(ring) => {
                setDrawing(false);
                setDraft({ ring });
              }}
              onDrawCancel={() => setDrawing(false)}
            />
          </FadeIn>
          <AnimatePresence>
            {draft && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.35, ease: EASE_FIELD }}>
                <Panel title={t("newField")} icon={<MapIcon width={18} height={18} />}>
                  <FieldForm
                    farmId={farm._id}
                    ring={draft.ring}
                    defaultCrop={farm.crops[0] ?? ""}
                    onCancel={() => setDraft(null)}
                    onSaved={(field) => {
                      setDraft(null);
                      setDetail((d) => d && { ...d, fields: [...d.fields, field] });
                      setSelectedId(field._id);
                    }}
                  />
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
          <Panel title={selected ? t("calendarFor", { name: selected.name }) : t("calendar.title")} icon={<SproutMark width={18} height={18} />}>
            {selected ? (
              <CropCalendar key={selected._id} field={selected} onRemind={createReminders} />
            ) : (
              <p className="text-sm text-fg-muted">{t("selectField")}</p>
            )}
          </Panel>
          {selected && (
            <Panel title={t("insightsFor", { name: selected.name })} icon={<ChartIcon width={18} height={18} />}>
              <FieldInsights key={selected._id} field={selected} />
            </Panel>
          )}
        </div>

        <aside className="space-y-5">
          <WeatherWidget farmId={farm._id} hasLocation={!!farm.location} />
          <Panel title={t("fields")} icon={<MapIcon width={18} height={18} />}>
            <FieldList fields={fields} selectedId={selectedId} onSelect={setSelectedId} onDelete={(f) => deleteField(f._id, f.name)} />
            {!draft && (
              <button type="button" onClick={() => setDraft({ ring: null })} className="mt-3 text-xs font-semibold text-accent hover:underline">
                {t("addWithoutMap")}
              </button>
            )}
          </Panel>
          <Panel title={t("reminders")} icon={<BellIcon width={18} height={18} />}>
            <RemindersPanel farmId={farm._id} fields={fields} reminders={reminders} onCreate={createReminders} onToggle={toggleReminder} onDelete={deleteReminder} />
          </Panel>
        </aside>
      </div>
    </main>
  );
}
