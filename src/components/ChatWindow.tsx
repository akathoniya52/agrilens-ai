"use client";

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { Attachment, ChatSummary } from "@/types/chat";
import MessageBubble from "./MessageBubble";
import { MessagesSkeleton } from "./chat/ChatSkeleton";
import Composer, { type ComposerHandle } from "./chat/Composer";
import EmptyState from "./chat/EmptyState";
import { LoadOlderButton, ThreadError, UnansweredNote } from "./chat/ThreadNotices";
import { MenuIcon, ScanIcon } from "./chat/icons";
import { useChatStream, type UiMessage } from "./chat/useChatStream";
import { useSpeech } from "./chat/useSpeech";

interface ChatWindowProps {
  chatId: string | null;
  title?: string;
  onChatCreated: (chat: ChatSummary) => void;
  onChatActivity: (chat: { _id: string; title?: string }) => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
}

const STICK_THRESHOLD_PX = 140;
const LOAD_OLDER_THRESHOLD_PX = 240;

function sourceImageFor(messages: UiMessage[], index: number): Attachment | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const image = messages[i].attachments?.find((a) => a.type.startsWith("image/"));
    if (messages[i].role === "user") return image;
  }
  return undefined;
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export default function ChatWindow({ chatId, title, onChatCreated, onChatActivity, onOpenSidebar, onNewChat }: ChatWindowProps) {
  const t = useTranslations("chat");
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const olderAnchorRef = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const speech = useSpeech();
  const chat = useChatStream({
    chatId,
    onChatCreated,
    onChatActivity,
    onRestoreDraft: (draft) => composerRef.current?.restore(draft),
  });

  const { messages, status, streamingId } = chat;
  const showEmpty = !chat.isLoading && !chat.loadFailed && messages.length === 0;
  const lastIndex = messages.length - 1;
  const firstId = messages[0]?._id;

  useEffect(() => {
    stickRef.current = true;
    olderAnchorRef.current = null;
  }, [chatId]);

  // Older messages were prepended: keep the same message under the user's finger.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = olderAnchorRef.current;
    if (!el || anchor === null) return;
    olderAnchorRef.current = null;
    el.scrollTop = el.scrollHeight - anchor;
  }, [firstId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight });
  }, [messages, chat.isLoading]);

  const loadOlder = () => {
    const el = scrollRef.current;
    if (!el || !chat.hasMore || chat.loadingOlder) return;
    olderAnchorRef.current = el.scrollHeight - el.scrollTop;
    void chat.loadOlder().then((added) => {
      if (!added) olderAnchorRef.current = null;
    });
  };

  const sendText = (content: string) => {
    stickRef.current = true;
    void chat.send({ content, attachments: [] });
  };

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDragOver: (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      composerRef.current?.addFiles(Array.from(event.dataTransfer.files));
    },
  };

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-surface" {...dropHandlers}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:hidden">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openChats")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <MenuIcon width={20} height={20} />
        </button>
        <p className="min-w-0 truncate text-sm font-semibold text-fg">{title ?? t("newChat")}</p>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
          if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX) loadOlder();
        }}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-10 pt-6 sm:px-6">
          {chat.isLoading ? (
            <MessagesSkeleton />
          ) : chat.loadFailed ? (
            <ThreadError notFound={chat.notFound} onRetry={chat.retryLoad} onNewChat={onNewChat} />
          ) : showEmpty ? (
            <EmptyState onScan={() => composerRef.current?.openCamera()} onPrompt={(text) => composerRef.current?.setText(text)} />
          ) : (
            <>
            {chat.hasMore && <LoadOlderButton loading={chat.loadingOlder} onClick={loadOlder} />}
            <div className="space-y-7">
              {messages.map((message, i) => {
                const streaming = message._id === streamingId;
                const isLatest = i === lastIndex;
                return (
                  <MessageBubble
                    key={message.clientKey ?? message._id}
                    message={message}
                    streaming={streaming}
                    isLatest={isLatest}
                    sourceImage={message.diagnosis ? sourceImageFor(messages, i) : undefined}
                    speaking={speech.speakingId === message._id}
                    onSpeak={() => speech.toggle(message._id, message.content)}
                    onFeedback={(value) => void chat.setFeedback(message._id, value)}
                    onRegenerate={isLatest && status === "idle" ? chat.regenerate : undefined}
                    onFollowUp={status === "idle" ? sendText : undefined}
                  />
                );
              })}
              {chat.unanswered && <UnansweredNote onRegenerate={chat.regenerate} disabled={status !== "idle"} />}
            </div>
            </>
          )}
        </div>
      </div>

      <div className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-surface to-transparent" />
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            ref={composerRef}
            status={status}
            disabled={!chat.ready}
            onStop={chat.stop}
            onSend={(draft) => {
              stickRef.current = true;
              return chat.send(draft);
            }}
          />
          <p className="mt-2 hidden text-center text-xs text-fg-subtle sm:block">{t("disclaimer")}</p>
        </div>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-surface/85 backdrop-blur-md"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-glow">
              <ScanIcon width={30} height={30} />
            </span>
            <p className="font-display text-lg font-semibold text-fg">{t("dropImage")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
