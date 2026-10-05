"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CREDITS_EVENT } from "@/components/account";
import { haptic } from "@/lib/haptics";
import { OUTBOX_EVENT, listOutbox, outboxSupported, queueMessage, type FlushResult } from "@/lib/outbox";
import { readEventStream } from "@/lib/stream";
import type { Attachment, ChatMessage, ChatSummary, Feedback } from "@/types/chat";
import { createChat, listMessages, postMessage, sendFeedback, type PostMessageBody } from "./chat-api";

export type StreamStatus = "idle" | "submitted" | "streaming";

export interface Draft {
  content: string;
  attachments: Attachment[];
}

/**
 * `clientKey` keeps React keys stable when temp ids are swapped for server ids.
 * `pending` marks a message waiting in the offline outbox.
 */
export type UiMessage = ChatMessage & { clientKey?: string; pending?: boolean };

interface Thread {
  chatId: string | null;
  messages: UiMessage[];
  stale: boolean;
}

interface Options {
  chatId: string | null;
  onChatCreated: (chat: ChatSummary) => void;
  onChatActivity: (chat: { _id: string; title?: string }) => void;
  onRestoreDraft: (draft: Draft) => void;
}

interface RunOptions {
  optimisticUserId?: string;
  draft?: Draft;
  restore?: UiMessage;
  queueable?: boolean;
}

const TEMP_PREFIX = "temp-";
const EMPTY: UiMessage[] = [];
let tempSeq = 0;

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
const tempId = (kind: string) => `${TEMP_PREFIX}${kind}-${Date.now()}-${tempSeq++}`;

async function loadThread(chatId: string, signal: AbortSignal): Promise<UiMessage[]> {
  const [messages, queued] = await Promise.all([
    listMessages(chatId, signal),
    outboxSupported() ? listOutbox(chatId) : Promise.resolve([]),
  ]);
  const pending: UiMessage[] = queued.map((item) => ({
    _id: `${TEMP_PREFIX}outbox-${item.id}`,
    chatId,
    role: "user",
    content: item.content,
    createdAt: item.createdAt,
    pending: true,
  }));
  return [...messages, ...pending];
}

export function useChatStream({ chatId, onChatCreated, onChatActivity, onRestoreDraft }: Options) {
  const t = useTranslations("chat");
  const [thread, setThread] = useState<Thread>({ chatId: null, messages: [], stale: false });
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const threadKey = useRef<{ chatId: string | null; stale: boolean }>({ chatId: null, stale: false });
  const abortRef = useRef<AbortController | null>(null);
  const streamChatRef = useRef<string | null>(null);

  function replaceThread(next: Thread) {
    threadKey.current = { chatId: next.chatId, stale: next.stale };
    setThread(next);
  }

  function updateMessages(targetId: string, update: (messages: UiMessage[]) => UiMessage[]) {
    setThread((prev) => (prev.chatId === targetId ? { ...prev, messages: update(prev.messages) } : prev));
  }

  function patchMessage(targetId: string, id: string, patch: Partial<UiMessage>) {
    updateMessages(targetId, (list) => list.map((m) => (m._id === id ? { ...m, ...patch } : m)));
  }

  useEffect(() => {
    if (streamChatRef.current && streamChatRef.current !== chatId) abortRef.current?.abort();
    if (!chatId) return;
    const key = threadKey.current;
    if (key.chatId === chatId && !key.stale) return;

    const controller = new AbortController();
    loadThread(chatId, controller.signal)
      .then((messages) => {
        threadKey.current = { chatId, stale: false };
        setThread({ chatId, messages, stale: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) toast.error(t("loadFailed"));
      });
    return () => controller.abort();
  }, [chatId, t]);

  useEffect(() => {
    if (!chatId) return;
    const controller = new AbortController();
    const onFlush = (event: Event) => {
      const { sent, dropped, chatIds } = (event as CustomEvent<FlushResult>).detail;
      if (!chatIds.includes(chatId) && dropped === 0) return;
      if (sent === 0 && dropped === 0) return;
      loadThread(chatId, controller.signal)
        .then((messages) => {
          if (threadKey.current.chatId !== chatId) return;
          threadKey.current = { chatId, stale: false };
          setThread({ chatId, messages, stale: false });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) console.error("Reload after outbox flush failed:", error);
        });
    };
    window.addEventListener(OUTBOX_EVENT, onFlush);
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onFlush);
      controller.abort();
    };
  }, [chatId]);

  async function enqueue(targetId: string, content: string, clientId: string): Promise<boolean> {
    try {
      await queueMessage(targetId, content, clientId);
      toast.info(t("queuedOffline"));
      return true;
    } catch (error) {
      console.error("Queueing offline message failed:", error);
      toast.error(t("error"));
      return false;
    }
  }

  useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  async function run(targetId: string, body: PostMessageBody, opts: RunOptions = {}) {
    const controller = new AbortController();
    abortRef.current = controller;
    streamChatRef.current = targetId;

    const assistantId = tempId("assistant");
    setStreamingId(assistantId);
    updateMessages(targetId, (list) => [
      ...list,
      { _id: assistantId, chatId: targetId, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);

    let text = "";
    let gotMeta = false;
    let finished = false;
    let streaming = false;
    let failure: string | null = null;
    let queued = false;
    let frame = 0;
    const flush = () => {
      frame = 0;
      patchMessage(targetId, assistantId, { content: text });
    };

    try {
      const res = await postMessage(targetId, body, controller.signal);
      if (res.status === 402) {
        failure = "credits";
      } else {
        await readEventStream(res, (event) => {
          switch (event.type) {
            case "meta":
              gotMeta = true;
              updateMessages(targetId, (list) =>
                list.map((m) =>
                  m._id === opts.optimisticUserId || m._id === event.userMsg._id
                    ? { ...event.userMsg, clientKey: m.clientKey ?? m._id }
                    : m
                )
              );
              break;
            case "delta":
              text += event.text;
              if (!streaming) {
                streaming = true;
                setStatus("streaming");
              }
              if (!frame) frame = requestAnimationFrame(flush);
              break;
            case "diagnosis":
              patchMessage(targetId, assistantId, { diagnosis: event.diagnosis });
              break;
            case "done":
              finished = true;
              cancelAnimationFrame(frame);
              patchMessage(targetId, assistantId, {
                ...event.assistantMsg,
                followUps: event.followUps,
                clientKey: assistantId,
              });
              onChatActivity(event.chat);
              window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: event.credits }));
              haptic([12, 60, 12]);
              break;
            case "error":
              failure = event.error;
              break;
          }
        });
      }
    } catch (error) {
      const networkError = error instanceof TypeError && !gotMeta && !text;
      if (!controller.signal.aborted && networkError && opts.queueable && opts.draft && body.clientId) {
        queued = await enqueue(targetId, opts.draft.content, body.clientId);
      }
      if (queued) {
        patchMessage(targetId, opts.optimisticUserId ?? "", { pending: true });
      } else if (!controller.signal.aborted) {
        failure = t("error");
      }
    } finally {
      cancelAnimationFrame(frame);
      if (!finished) {
        const aborted = controller.signal.aborted;
        updateMessages(targetId, (list) => {
          let next = text
            ? list.map((m) => (m._id === assistantId ? { ...m, content: text } : m))
            : list.filter((m) => m._id !== assistantId);
          if (!gotMeta && !aborted && failure) {
            next = next.filter((m) => m._id !== opts.optimisticUserId);
            if (opts.restore) next = [...next, opts.restore];
          }
          return next;
        });
        if (aborted || text) {
          threadKey.current = { chatId: targetId, stale: true };
          setThread((prev) => (prev.chatId === targetId ? { ...prev, stale: true } : prev));
        }
        if (!gotMeta && !aborted && !queued && opts.draft) onRestoreDraft(opts.draft);
        if (failure === "credits") {
          toast.error(t("outOfCredits"), { description: t("outOfCreditsBody") });
        } else if (failure) {
          toast.error(failure);
        }
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
        streamChatRef.current = null;
      }
      setStreamingId(null);
      setStatus("idle");
    }
  }

  async function send(draft: Draft): Promise<boolean> {
    if (status !== "idle") return false;
    setStatus("submitted");
    haptic();

    let targetId = chatId;
    if (!targetId) {
      try {
        const chat = await createChat();
        targetId = chat._id;
        replaceThread({ chatId: chat._id, messages: [], stale: false });
        onChatCreated(chat);
      } catch {
        setStatus("idle");
        toast.error(t("error"));
        return false;
      }
    } else {
      onChatActivity({ _id: targetId });
    }

    const optimistic: ChatMessage = {
      _id: tempId("user"),
      chatId: targetId,
      role: "user",
      content: draft.content,
      attachments: draft.attachments,
      createdAt: new Date().toISOString(),
    };
    const clientId = crypto.randomUUID();
    const queueable = chatId !== null && draft.attachments.length === 0 && outboxSupported();
    if (queueable && !navigator.onLine) {
      updateMessages(targetId, (list) => [...list, { ...optimistic, pending: true }]);
      const queued = await enqueue(targetId, draft.content, clientId);
      if (!queued) updateMessages(targetId, (list) => list.filter((m) => m._id !== optimistic._id));
      setStatus("idle");
      return queued;
    }

    updateMessages(targetId, (list) => [...list, optimistic]);
    void run(
      targetId,
      { content: draft.content, attachments: draft.attachments, clientId },
      { optimisticUserId: optimistic._id, draft, queueable }
    );
    return true;
  }

  function regenerate() {
    if (!chatId || status !== "idle" || thread.chatId !== chatId) return;
    const last = thread.messages.at(-1);
    if (!last || last.role !== "assistant") return;
    setStatus("submitted");
    updateMessages(chatId, (list) => list.filter((m) => m._id !== last._id));
    void run(chatId, { content: "", regenerate: true }, { restore: last });
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function setFeedback(messageId: string, value: Exclude<Feedback, null>) {
    if (!thread.chatId) return;
    const targetId = thread.chatId;
    const previous = thread.messages.find((m) => m._id === messageId)?.feedback ?? null;
    const next: Feedback = previous === value ? null : value;
    patchMessage(targetId, messageId, { feedback: next });
    try {
      await sendFeedback(messageId, next);
    } catch {
      patchMessage(targetId, messageId, { feedback: previous });
      toast.error(t("feedbackFailed"));
    }
  }

  const loaded = chatId !== null && thread.chatId === chatId;
  return {
    messages: loaded ? thread.messages : EMPTY,
    isLoading: chatId !== null && !loaded,
    status,
    streamingId,
    send,
    stop,
    regenerate,
    setFeedback,
  };
}
