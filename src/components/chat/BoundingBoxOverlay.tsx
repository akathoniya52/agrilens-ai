"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { EASE_FIELD, cx } from "@/components/ui";
import type { Attachment, BoundingBox } from "@/types/chat";

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

function toRect(box: BoundingBox) {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  return { x, y, w: Math.min(clamp01(box.w), 1 - x), h: Math.min(clamp01(box.h), 1 - y) };
}

interface BoundingBoxOverlayProps {
  image: Attachment;
  boxes: BoundingBox[];
  alt: string;
  /** Static Tailwind classes for the box tone, e.g. "border-sev-high text-sev-high". */
  toneClass: string;
  className?: string;
}

export default function BoundingBoxOverlay({ image, boxes, alt, toneClass, className }: BoundingBoxOverlayProps) {
  const locale = useLocale();
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

  return (
    <figure className={cx("relative isolate overflow-hidden rounded-2xl border border-border bg-surface-3", className)}>
      <Image
        src={image.url}
        alt={alt}
        width={image.width ?? 1200}
        height={image.height ?? 900}
        sizes="(max-width: 768px) 92vw, 420px"
        className="block h-auto w-full"
      />
      <span aria-hidden className="chat-scanline pointer-events-none absolute inset-x-0 top-0 h-16" />
      <ul className="absolute inset-0">
        {boxes.map((box, i) => {
          const r = toRect(box);
          const labelBelow = r.y < 0.12;
          return (
            <motion.li
              key={`${box.label}-${i}`}
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.9 + i * 0.15, ease: EASE_FIELD }}
              className={cx("absolute rounded-md border-2 bg-current/10 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]", toneClass)}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            >
              <span
                className={cx(
                  "absolute left-[-2px] max-w-[min(14rem,80vw)] truncate whitespace-nowrap rounded-md bg-surface/90 px-1.5 py-0.5 text-[0.7rem] font-semibold backdrop-blur",
                  labelBelow ? "top-full mt-1" : "bottom-full mb-1"
                )}
              >
                {box.label} · {pct.format(clamp01(box.confidence))}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </figure>
  );
}
