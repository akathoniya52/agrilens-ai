"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckIcon, UserIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { Feedback } from "@/types/chat";
import { CopyIcon, RefreshIcon, SpeakerIcon, StopIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

interface MessageActionsProps {
  content: string;
  feedback?: Feedback;
  speaking: boolean;
  pinned: boolean;
  onSpeak: () => void;
  onFeedback?: (value: "up" | "down") => void;
  onRegenerate?: () => void;
  onEscalate?: () => void;
  escalated?: boolean;
}

function ActionButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-surface-3",
        active ? "text-accent" : "text-fg-subtle hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

export default function MessageActions({
  content,
  feedback,
  speaking,
  pinned,
  onSpeak,
  onFeedback,
  onRegenerate,
  onEscalate,
  escalated,
}: MessageActionsProps) {
  const t = useTranslations("chat");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("error"));
    }
  }

  return (
    <div
      className={cx(
        "-ml-2 mt-1 flex items-center gap-0.5 transition-opacity duration-200",
        pinned ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100"
      )}
    >
      <ActionButton label={copied ? t("copied") : t("copy")} active={copied} onClick={copy}>
        {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
      </ActionButton>
      <ActionButton label={speaking ? t("stopReading") : t("readAloud")} active={speaking} onClick={onSpeak}>
        {speaking ? <StopIcon width={14} height={14} /> : <SpeakerIcon width={16} height={16} />}
      </ActionButton>
      {onFeedback && (
        <>
          <ActionButton label={t("helpful")} active={feedback === "up"} onClick={() => onFeedback("up")}>
            <ThumbUpIcon width={16} height={16} fill={feedback === "up" ? "currentColor" : "none"} fillOpacity={0.2} />
          </ActionButton>
          <ActionButton label={t("notHelpful")} active={feedback === "down"} onClick={() => onFeedback("down")}>
            <ThumbDownIcon width={16} height={16} fill={feedback === "down" ? "currentColor" : "none"} fillOpacity={0.2} />
          </ActionButton>
        </>
      )}
      {onEscalate && (
        <ActionButton
          label={escalated ? t("expertRequested") : t("askExpert")}
          active={escalated}
          onClick={onEscalate}
        >
          <UserIcon width={16} height={16} />
        </ActionButton>
      )}
      {onRegenerate && (
        <ActionButton label={t("regenerate")} onClick={onRegenerate}>
          <RefreshIcon width={16} height={16} />
        </ActionButton>
      )}
    </div>
  );
}
