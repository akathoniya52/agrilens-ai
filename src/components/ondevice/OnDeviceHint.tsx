"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BoltIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import { onDeviceEnabled, type OnDevicePrediction } from "@/lib/ondevice";

type Result = { src: string; prediction: OnDevicePrediction | null };

/** Instant offline pre-diagnosis of the first attached image. Renders nothing unless a TF.js model is configured. */
export default function OnDeviceHint({ src, className }: { src: string | null | undefined; className?: string }) {
  const t = useTranslations("onDevice");
  const [result, setResult] = useState<Result | null>(null);
  const enabled = onDeviceEnabled();

  useEffect(() => {
    if (!enabled || !src) return;
    let cancelled = false;
    import("@/lib/ondevice/classifier")
      .then(async ({ loadImage, loadOnDeviceClassifier }) => {
        const classifier = await loadOnDeviceClassifier();
        if (!classifier) return null;
        const [top] = await classifier.classify(await loadImage(src), 1);
        return top ?? null;
      })
      .catch((error: unknown) => {
        console.warn("AgriLens on-device classification failed:", error);
        return null;
      })
      .then((prediction) => !cancelled && setResult({ src, prediction }));
    return () => {
      cancelled = true;
    };
  }, [enabled, src]);

  if (!enabled || !src) return null;
  const current = result?.src === src ? result : null;
  if (current && !current.prediction) return null;

  const p = current?.prediction;
  return (
    <div
      role="status"
      className={cx(
        "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-fg-muted",
        className
      )}
    >
      <BoltIcon width={14} height={14} className="shrink-0 text-warning" />
      {p ? (
        <span className="min-w-0 truncate">
          <span className="font-semibold text-fg">{t("label")}:</span>{" "}
          {[p.crop, p.condition].filter(Boolean).join(" · ")} · {Math.round(p.confidence * 100)}%
          <span className="text-fg-subtle"> — {t("refine")}</span>
        </span>
      ) : (
        <span>{t("analyzing")}</span>
      )}
    </div>
  );
}
