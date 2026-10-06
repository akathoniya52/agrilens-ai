"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { buildCropCalendar, cropStage, type CalendarTask, type StageKey } from "@/lib/crop-calendar";
import { BellIcon } from "@/components/icons";
import { cx, EASE_FIELD } from "@/components/ui";
import type { FieldDTO } from "@/types/farm";
import type { ReminderInput } from "./api";

const STAGE_TONES = ["bg-leaf-900", "bg-leaf-800", "bg-leaf-700", "bg-leaf-600", "bg-leaf-500", "bg-harvest/80", "bg-harvest"];

interface CropCalendarProps {
  field: FieldDTO;
  onRemind: (inputs: ReminderInput[]) => Promise<boolean>;
}

export default function CropCalendar({ field, onRemind }: CropCalendarProps) {
  const t = useTranslations("farms");
  const format = useFormatter();
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const sowing = field.sowingDate;

  const calendar = useMemo(() => (sowing ? buildCropCalendar(field.crop, sowing) : null), [field.crop, sowing]);
  if (!sowing || !calendar) {
    return <p className="text-sm text-fg-muted">{t("calendar.needSowing")}</p>;
  }

  const info = cropStage(field.crop, sowing, new Date(now));
  const upcoming = calendar.tasks.filter((task) => Date.parse(task.date) >= now - 86_400_000).slice(0, 6);
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short" });
  const stageName = (key: StageKey) => t(`calendar.stages.${key}`);
  const taskName = (task: CalendarTask) => t(`calendar.tasks.${task.key}`);
  const toInput = (task: CalendarTask): ReminderInput => ({
    title: `${field.name}: ${taskName(task)}`,
    dueAt: task.date,
    kind: task.kind,
    fieldId: field._id,
  });

  async function remind(tasks: CalendarTask[]) {
    setBusy(true);
    try {
      await onRemind(tasks.map(toInput));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-fg-muted">
        {info.status === "growing"
          ? t("calendar.das", { days: info.das, stage: info.stage ? stageName(info.stage.key) : "" })
          : info.status === "planned"
            ? t("calendar.planned", { days: -info.das })
            : t("calendar.finished")}
      </p>

      <div className="relative mt-4" role="img" aria-label={t("calendar.timeline")}>
        <div className="flex h-9 overflow-hidden rounded-xl">
          {calendar.stages.map((stage, i) => (
            <motion.div
              key={stage.key}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: EASE_FIELD }}
              title={`${stageName(stage.key)} · ${date(stage.startDate)}`}
              className={cx("h-full origin-bottom border-r border-surface-2/60 last:border-0", STAGE_TONES[i % STAGE_TONES.length], info.stage?.key === stage.key && "ring-2 ring-inset ring-fg")}
              style={{ width: `${((stage.end - stage.start) / calendar.totalDays) * 100}%` }}
            />
          ))}
        </div>
        {info.status === "growing" && (
          <motion.span
            aria-hidden
            initial={{ left: 0, opacity: 0 }}
            animate={{ left: `${info.progress * 100}%`, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE_FIELD }}
            className="absolute -bottom-1.5 -top-1.5 w-0.5 -translate-x-1/2 rounded-full bg-fg shadow-[0_0_12px_var(--color-glow)]"
          />
        )}
      </div>
      <ol className="mt-2 flex text-[10px] font-medium text-fg-subtle">
        {calendar.stages.map((stage) => (
          <li key={stage.key} className="truncate pr-1" style={{ width: `${((stage.end - stage.start) / calendar.totalDays) * 100}%` }}>
            {stageName(stage.key)}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{t("calendar.upcoming")}</h3>
        {upcoming.length > 0 && (
          <button type="button" disabled={busy} onClick={() => remind(upcoming)} className="text-xs font-semibold text-accent hover:underline disabled:opacity-50">
            {t("calendar.remindAll")}
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-surface">
        {upcoming.length === 0 && <li className="px-4 py-3 text-sm text-fg-muted">{t("calendar.noTasks")}</li>}
        {upcoming.map((task) => (
          <li key={`${task.key}-${task.day}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-14 shrink-0 text-xs font-semibold text-fg-subtle">{date(task.date)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{taskName(task)}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => remind([task])}
              aria-label={t("calendar.remind")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50"
            >
              <BellIcon width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
