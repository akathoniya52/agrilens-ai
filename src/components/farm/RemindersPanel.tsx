"use client";

import { useId, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { CheckIcon } from "@/components/icons";
import { cx, EASE_FIELD } from "@/components/ui";
import { REMINDER_KINDS, type FieldDTO, type ReminderDTO, type ReminderKind as ReminderInputKind } from "@/types/farm";
import type { ReminderInput } from "./api";
import { inputClass } from "./FarmForm";
import PushToggle from "./PushToggle";

interface RemindersPanelProps {
  farmId: string;
  fields: FieldDTO[];
  reminders: ReminderDTO[];
  /** Resolves to true once saved; the form keeps its input otherwise. */
  onCreate: (inputs: ReminderInput[]) => Promise<boolean>;
  onToggle: (reminder: ReminderDTO) => void;
  onDelete: (reminder: ReminderDTO) => void;
}

const DAY_MS = 86_400_000;

export default function RemindersPanel({ farmId, fields, reminders, onCreate, onToggle, onDelete }: RemindersPanelProps) {
  const t = useTranslations("farms");
  const tc = useTranslations("common");
  const format = useFormatter();
  const id = useId();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [kind, setKind] = useState<ReminderInputKind>("custom");
  const [fieldId, setFieldId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());

  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);
  const fieldName = (fid: string | null) => fields.find((f) => f._id === fid)?.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !title.trim() || !due) return;
    setSaving(true);
    try {
      const saved = await onCreate([{ title: title.trim(), dueAt: new Date(`${due}T08:00:00`).toISOString(), kind, farmId, fieldId: fieldId || null }]);
      if (!saved) return;
      setTitle("");
      setDue("");
    } finally {
      setSaving(false);
    }
  }

  const row = (r: ReminderDTO) => {
    const overdue = !r.done && Date.parse(r.dueAt) < now - DAY_MS / 2;
    return (
      <motion.li
        key={r._id}
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease: EASE_FIELD }}
        className="group flex items-center gap-3 px-3 py-2.5"
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={r.done}
          aria-label={r.title}
          onClick={() => onToggle(r)}
          className={cx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
            r.done ? "border-accent bg-accent text-accent-fg" : "border-border-strong hover:border-accent"
          )}
        >
          {r.done && <CheckIcon width={14} height={14} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-sm", r.done ? "text-fg-subtle line-through" : "text-fg")}>{r.title}</p>
          <p className={cx("text-xs", overdue ? "font-semibold text-danger" : "text-fg-subtle")}>
            {format.dateTime(new Date(r.dueAt), { weekday: "short", day: "numeric", month: "short" })}
            {` · ${t(`kinds.${r.kind}`)}`}
            {fieldName(r.fieldId) ? ` · ${fieldName(r.fieldId)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(r)}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-subtle opacity-100 transition-opacity hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          {t("remove")}
        </button>
      </motion.li>
    );
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <PushToggle />
      </div>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input aria-label={t("reminderTitle")} placeholder={t("reminderPlaceholder")} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        <input id={`${id}-d`} aria-label={t("dueDate")} type="date" required value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
        <select aria-label={t("kind")} value={kind} onChange={(e) => setKind(e.target.value as ReminderInputKind)} className={inputClass}>
          {REMINDER_KINDS.map((k) => (
            <option key={k} value={k}>{t(`kinds.${k}`)}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select aria-label={t("field")} value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={cx(inputClass, "flex-1")}>
            <option value="">{t("wholeFarm")}</option>
            {fields.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
          <button type="submit" disabled={saving || !title.trim() || !due} aria-busy={saving} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50">
            {tc("save")}
          </button>
        </div>
      </form>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {open.length === 0 && <li className="px-4 py-4 text-sm text-fg-muted">{t("noReminders")}</li>}
        <AnimatePresence initial={false}>{open.map(row)}</AnimatePresence>
      </ul>

      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-semibold text-fg-subtle hover:text-fg">
            {t("completedCount", { count: done.length })} {showDone ? "▴" : "▾"}
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/60">
              <AnimatePresence initial={false}>{done.map(row)}</AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
