"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ChatIcon, WifiOffIcon } from "@/components/icons";
import { EASE_FIELD } from "@/components/ui";
import { PlusIcon, RefreshIcon } from "./icons";

const actionButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function ThreadError({ notFound, onRetry, onNewChat }: { notFound: boolean; onRetry: () => void; onNewChat: () => void }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_FIELD }}
      className="m-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
        {notFound ? <ChatIcon width={24} height={24} /> : <WifiOffIcon width={24} height={24} />}
      </span>
      <p className="font-display text-lg font-semibold text-fg">{notFound ? t("chatNotFound") : t("loadFailed")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {!notFound && (
          <button type="button" onClick={onRetry} className={`${actionButton} bg-accent text-accent-fg shadow-glow hover:brightness-110`}>
            <RefreshIcon width={16} height={16} />
            {tc("retry")}
          </button>
        )}
        <button
          type="button"
          onClick={onNewChat}
          className={`${actionButton} border border-border-strong text-fg hover:bg-surface-3`}
        >
          <PlusIcon width={16} height={16} />
          {t("newChat")}
        </button>
      </div>
    </motion.div>
  );
}

export function UnansweredNote({ onRegenerate, disabled }: { onRegenerate: () => void; disabled: boolean }) {
  const t = useTranslations("chat");
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_FIELD }}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-2/60 px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm text-fg-muted">{t("noAnswerYet")}</p>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={disabled}
        className={`${actionButton} min-h-10 border border-border-strong text-fg hover:border-accent/60 hover:text-accent`}
      >
        <RefreshIcon width={16} height={16} />
        {t("regenerate")}
      </button>
    </motion.div>
  );
}

export function LoadOlderButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const t = useTranslations("chat");
  return (
    <div className="flex justify-center pb-6">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-3.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-70"
      >
        {loading && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
        {t("loadOlder")}
      </button>
    </div>
  );
}
