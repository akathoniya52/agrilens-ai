"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { SproutMark } from "@/components/icons";
import { EASE_FIELD, SproutLoader, cx } from "@/components/ui";
import type { Attachment } from "@/types/chat";
import { casesApi } from "@/components/insights/api";
import CitationChips from "./chat/CitationChips";
import DiagnosisCard from "./chat/DiagnosisCard";
import FollowUpChips from "./chat/FollowUpChips";
import Markdown from "./chat/Markdown";
import MessageActions from "./chat/MessageActions";
import { isTempId, type UiMessage } from "./chat/useChatStream";

interface MessageBubbleProps {
  message: UiMessage;
  streaming: boolean;
  isLatest: boolean;
  sourceImage?: Attachment;
  speaking: boolean;
  onSpeak: () => void;
  onFeedback: (value: "up" | "down") => void;
  onRegenerate?: () => void;
  onFollowUp?: (question: string) => void;
}

function UserAttachments({ attachments }: { attachments: Attachment[] }) {
  const t = useTranslations("chat");
  const single = attachments.length === 1;
  return (
    <div className={cx("mb-2 grid gap-1.5", single ? "w-64 max-w-full" : "w-72 max-w-full grid-cols-2")}>
      {attachments.map((attachment, i) => (
        <Image
          key={`${attachment.url.slice(-24)}-${i}`}
          src={attachment.url}
          alt={t("attachedImage", { index: i + 1 })}
          width={attachment.width ?? 800}
          height={attachment.height ?? 600}
          sizes="(max-width: 768px) 70vw, 288px"
          className={cx(
            "w-full rounded-2xl border border-border object-cover",
            single ? "h-auto max-h-80" : "aspect-square h-auto"
          )}
        />
      ))}
    </div>
  );
}

export default function MessageBubble({
  message,
  streaming,
  isLatest,
  sourceImage,
  speaking,
  onSpeak,
  onFeedback,
  onRegenerate,
  onFollowUp,
}: MessageBubbleProps) {
  const t = useTranslations("chat");
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const entrance = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: EASE_FIELD },
  };

  if (message.role === "user") {
    return (
      <motion.article {...entrance} className="flex flex-col items-end" aria-label={t("you")}>
        {message.attachments && message.attachments.length > 0 && <UserAttachments attachments={message.attachments} />}
        {message.content && (
          <p className="max-w-[min(85%,36rem)] whitespace-pre-wrap rounded-3xl rounded-br-lg border border-accent/25 bg-accent-soft px-4 py-2.5 text-[0.975rem] leading-relaxed text-fg [overflow-wrap:anywhere]">
            {message.content}
          </p>
        )}
        {message.pending && <span className="mt-1 text-xs text-fg-subtle">{t("pendingSend")}</span>}
      </motion.article>
    );
  }

  const waiting = streaming && !message.content && !message.diagnosis;
  const persisted = !isTempId(message._id);

  async function escalate() {
    if (escalated || escalating) return;
    setEscalating(true);
    try {
      await casesApi.create(message._id);
      setEscalated(true);
      toast.success(t("expertRequested"), {
        description: t("expertRequestedBody"),
        action: { label: t("viewCases"), onClick: () => window.location.assign("/cases") },
      });
    } catch {
      toast.error(t("error"));
    } finally {
      setEscalating(false);
    }
  }

  return (
    <motion.article {...entrance} className="group/msg flex gap-3" aria-label={t("assistantName")} aria-busy={streaming}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/25">
        <SproutMark width={17} height={17} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        {message.diagnosis && <DiagnosisCard diagnosis={message.diagnosis} image={sourceImage} />}
        {waiting ? (
          <SproutLoader size={34} label={t("thinking")} className="-mt-1" />
        ) : (
          message.content && <Markdown content={message.content} streaming={streaming} />
        )}
        {!streaming && message.citations && message.citations.length > 0 && <CitationChips citations={message.citations} />}
        {!streaming && message.content && (
          <MessageActions
            content={message.content}
            feedback={message.feedback}
            speaking={speaking}
            pinned={isLatest}
            onSpeak={onSpeak}
            onFeedback={persisted ? onFeedback : undefined}
            onRegenerate={onRegenerate}
            onEscalate={persisted ? escalate : undefined}
            escalated={escalated}
          />
        )}
        {isLatest && !streaming && onFollowUp && message.followUps && (
          <FollowUpChips items={message.followUps} onPick={onFollowUp} />
        )}
      </div>
    </motion.article>
  );
}
