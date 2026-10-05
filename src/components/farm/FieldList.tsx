"use client";

import { useFormatter, useTranslations } from "next-intl";
import { cropStage } from "@/lib/crop-calendar";
import { cx } from "@/components/ui";
import type { FieldDTO } from "@/types/farm";

interface FieldListProps {
  fields: FieldDTO[];
  selectedId: string | null;
  onSelect: (fieldId: string) => void;
  onDelete: (field: FieldDTO) => void;
}

export default function FieldList({ fields, selectedId, onSelect, onDelete }: FieldListProps) {
  const t = useTranslations("farms");
  const format = useFormatter();

  if (!fields.length) {
    return <p className="text-sm text-fg-muted">{t("noFields")}</p>;
  }

  return (
    <ul className="space-y-2">
      {fields.map((field) => {
        const info = field.sowingDate ? cropStage(field.crop, field.sowingDate) : null;
        const selected = field._id === selectedId;
        return (
          <li key={field._id}>
            <div
              className={cx(
                "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
                selected ? "border-accent/50 bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
              )}
            >
              <button type="button" onClick={() => onSelect(field._id)} aria-pressed={selected} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold text-fg">{field.name}</span>
                <span className="block truncate text-xs text-fg-subtle">
                  <span className="capitalize">{field.crop || "—"}</span>
                  {field.areaHa ? ` · ${format.number(field.areaHa, { maximumFractionDigits: 2 })} ha` : ""}
                  {info?.status === "growing" && ` · ${t("dayN", { days: info.das })}`}
                </span>
              </button>
              {info?.status === "growing" && (
                <span className="relative h-9 w-9 shrink-0" aria-hidden>
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                    <circle cx="18" cy="18" r="15" className="fill-none stroke-surface-3" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      className="fill-none stroke-accent"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${info.progress * 94.25} 94.25`}
                    />
                  </svg>
                </span>
              )}
              <button
                type="button"
                onClick={() => onDelete(field)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-danger"
              >
                {t("remove")}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
