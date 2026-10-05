"use client";

import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { polygonAreaHa } from "@/lib/geo";
import { EASE_FIELD } from "@/components/ui";
import type { LngLat } from "@/types/farm";

interface DrawToolbarProps {
  vertices: LngLat[];
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

const btn = "min-h-10 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-50";

export default function DrawToolbar({ vertices, onUndo, onFinish, onCancel }: DrawToolbarProps) {
  const t = useTranslations("farms");
  const format = useFormatter();
  const area = vertices.length >= 3 ? polygonAreaHa(vertices) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_FIELD }}
      className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border-strong bg-surface-2/90 p-2 pl-4 shadow-raised backdrop-blur-md sm:right-auto"
      role="toolbar"
      aria-label={t("map.drawing")}
    >
      <p className="mr-auto text-sm text-fg" aria-live="polite">
        {vertices.length < 3
          ? t("map.hint")
          : t("map.area", { area: format.number(area, { maximumFractionDigits: 2 }) })}
      </p>
      <button type="button" onClick={onUndo} disabled={!vertices.length} className={`${btn} text-fg-muted hover:bg-surface-3`}>
        {t("map.undo")}
      </button>
      <button type="button" onClick={onCancel} className={`${btn} text-fg-muted hover:bg-surface-3`}>
        {t("map.cancel")}
      </button>
      <button type="button" onClick={onFinish} disabled={vertices.length < 3} className={`${btn} bg-accent text-accent-fg`}>
        {t("map.finish")}
      </button>
    </motion.div>
  );
}
