"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import { GlobeIcon } from "@/components/icons";
import { IRRIGATION_TYPES, SOIL_TYPES, type FarmDTO, type IrrigationType, type SoilType } from "@/types/farm";
import { farmsApi } from "./api";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none";
export const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle";

const parseNum = (value: string) => (value.trim() === "" ? null : Number(value));

export default function FarmForm({ onCreated, onCancel }: { onCreated: (farm: FarmDTO) => void; onCancel?: () => void }) {
  const t = useTranslations("farms");
  const tc = useTranslations("common");
  const id = useId();
  const [name, setName] = useState("");
  const [crops, setCrops] = useState("");
  const [area, setArea] = useState("");
  const [soil, setSoil] = useState<SoilType | "">("");
  const [irrigation, setIrrigation] = useState<IrrigationType | "">("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.error(t("geoUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(5));
        setLon(coords.longitude.toFixed(5));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(t("geoFailed"));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const latN = parseNum(lat);
    const lonN = parseNum(lon);
    const hasLoc = latN !== null && lonN !== null && Number.isFinite(latN) && Number.isFinite(lonN);
    setSaving(true);
    try {
      const farm = await farmsApi.create({
        name: name.trim(),
        crops: crops.split(",").map((c) => c.trim()).filter(Boolean),
        areaHa: parseNum(area),
        soilType: soil || null,
        irrigation: irrigation || null,
        location: hasLoc ? { type: "Point", coordinates: [lonN, latN] } : null,
      });
      toast.success(t("created", { name: farm.name }));
      onCreated(farm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-name`} className={labelClass}>{t("name")}</label>
        <input id={`${id}-name`} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-crops`} className={labelClass}>{t("crops")}</label>
        <input
          id={`${id}-crops`}
          value={crops}
          onChange={(e) => setCrops(e.target.value)}
          placeholder={t("cropsPlaceholder")}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-soil`} className={labelClass}>{t("soilType")}</label>
        <select id={`${id}-soil`} value={soil} onChange={(e) => setSoil(e.target.value as SoilType | "")} className={inputClass}>
          <option value="">—</option>
          {SOIL_TYPES.map((s) => (
            <option key={s} value={s}>{t(`soil.${s}`)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-irr`} className={labelClass}>{t("irrigation")}</label>
        <select
          id={`${id}-irr`}
          value={irrigation}
          onChange={(e) => setIrrigation(e.target.value as IrrigationType | "")}
          className={inputClass}
        >
          <option value="">—</option>
          {IRRIGATION_TYPES.map((s) => (
            <option key={s} value={s}>{t(`irrigationTypes.${s}`)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-area`} className={labelClass}>{t("area")} (ha)</label>
        <input id={`${id}-area`} type="number" min="0" step="0.01" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={labelClass}>{t("location")}</legend>
        <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input aria-label="Latitude" placeholder="Lat" type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} />
          <input aria-label="Longitude" placeholder="Lon" type="number" step="any" min="-180" max="180" value={lon} onChange={(e) => setLon(e.target.value)} className={inputClass} />
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-60 sm:col-span-1"
          >
            <GlobeIcon width={16} height={16} className={cx(locating && "motion-safe:animate-spin")} />
            {t("useLocation")}
          </button>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-fg-muted hover:bg-surface-3">
            {tc("cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {saving ? tc("loading") : t("save")}
        </button>
      </div>
    </form>
  );
}
