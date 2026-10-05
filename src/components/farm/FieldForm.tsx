"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { polygonAreaHa, toPolygon } from "@/lib/geo";
import type { FieldDTO, LngLat } from "@/types/farm";
import { fieldsApi } from "./api";
import { inputClass, labelClass } from "./FarmForm";

interface FieldFormProps {
  farmId: string;
  ring: LngLat[] | null;
  defaultCrop?: string;
  onSaved: (field: FieldDTO) => void;
  onCancel: () => void;
}

export default function FieldForm({ farmId, ring, defaultCrop = "", onSaved, onCancel }: FieldFormProps) {
  const t = useTranslations("farms");
  const tc = useTranslations("common");
  const format = useFormatter();
  const id = useId();
  const [name, setName] = useState("");
  const [crop, setCrop] = useState(defaultCrop);
  const [sowing, setSowing] = useState("");
  const [area, setArea] = useState("");
  const [saving, setSaving] = useState(false);
  const drawnArea = ring ? polygonAreaHa(ring) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const field = await fieldsApi.create(farmId, {
        name: name.trim(),
        crop: crop.trim(),
        sowingDate: sowing ? new Date(`${sowing}T00:00:00`).toISOString() : null,
        boundary: ring ? toPolygon(ring) : null,
        areaHa: ring || !area ? null : Number(area),
      });
      toast.success(t("fieldSaved", { name: field.name }));
      onSaved(field);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-n`} className={labelClass}>{t("fieldName")}</label>
        <input id={`${id}-n`} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-c`} className={labelClass}>{t("crop")}</label>
        <input id={`${id}-c`} maxLength={40} value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Tomato" className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-s`} className={labelClass}>{t("sowingDate")}</label>
        <input id={`${id}-s`} type="date" value={sowing} onChange={(e) => setSowing(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-a`} className={labelClass}>{t("area")} (ha)</label>
        {drawnArea !== null ? (
          <p id={`${id}-a`} className="flex min-h-11 items-center font-display text-lg font-semibold text-accent">
            {format.number(drawnArea, { maximumFractionDigits: 3 })} ha
          </p>
        ) : (
          <input id={`${id}-a`} type="number" min="0" step="0.01" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} />
        )}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-fg-muted hover:bg-surface-3">
          {tc("cancel")}
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg disabled:opacity-60">
          {saving ? tc("loading") : t("saveField")}
        </button>
      </div>
    </form>
  );
}
