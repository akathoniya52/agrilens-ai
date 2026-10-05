"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon, MapIcon } from "@/components/icons";
import { cx, GlowCard } from "@/components/ui";
import type { FarmDTO } from "@/types/farm";

interface FarmCardProps {
  farm: FarmDTO;
  active: boolean;
  onSetActive: () => void;
  onDelete: () => void;
}

export default function FarmCard({ farm, active, onSetActive, onDelete }: FarmCardProps) {
  const t = useTranslations("farms");
  const format = useFormatter();
  const coords = farm.location?.coordinates;

  return (
    <GlowCard className={cx("h-full p-5", active && "border-accent/50 shadow-glow")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl font-semibold text-fg">{farm.name}</h3>
          <p className="mt-1 text-xs text-fg-subtle">
            {coords ? `${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}` : t("noLocation")}
            {farm.areaHa ? ` · ${format.number(farm.areaHa, { maximumFractionDigits: 2 })} ha` : ""}
            {` · ${t("fieldCount", { count: farm.fieldCount ?? 0 })}`}
          </p>
        </div>
        {active ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            <CheckIcon width={12} height={12} strokeWidth={2.6} />
            {t("active")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetActive}
            className="shrink-0 rounded-full border border-border-strong px-2.5 py-1 text-xs font-semibold text-fg-muted transition-colors hover:border-accent hover:text-accent"
          >
            {t("setActive")}
          </button>
        )}
      </div>

      {farm.crops.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={t("crops")}>
          {farm.crops.map((crop) => (
            <li key={crop} className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-medium capitalize text-fg-muted">
              {crop}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
        <button type="button" onClick={onDelete} className="text-xs font-semibold text-fg-subtle transition-colors hover:text-danger">
          {t("delete")}
        </button>
        <Link
          href={`/farms/${farm._id}`}
          className="group inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-3 px-3.5 text-sm font-semibold text-fg transition-colors hover:bg-accent hover:text-accent-fg"
        >
          <MapIcon width={16} height={16} />
          {t("open")}
          <ArrowRightIcon width={14} height={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </GlowCard>
  );
}
