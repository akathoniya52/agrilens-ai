"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import { CloseIcon } from "./icons";
import type { PendingImage } from "./useAttachments";

export default function AttachmentTray({ items, onRemove }: { items: PendingImage[]; onRemove: (id: string) => void }) {
  const t = useTranslations("chat");

  return (
    <ul className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label={t("attachments")}>
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.li
            key={item.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={cx(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-surface-3",
              item.status === "error" ? "border-danger" : "border-border-strong"
            )}
          >
            <Image src={item.preview} alt={t("attachedImage", { index: i + 1 })} fill sizes="64px" className="object-cover" />
            {item.status === "uploading" && (
              <span className="shimmer absolute inset-0 flex items-end bg-surface/50 p-1">
                <span className="sr-only">{t("uploading")}</span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                  <span className="chat-progress block h-full w-1/2 rounded-full bg-accent" />
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={t("removeAttachment")}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface/85 text-fg backdrop-blur transition-colors hover:bg-danger hover:text-surface"
            >
              <CloseIcon width={12} height={12} strokeWidth={2.4} />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
