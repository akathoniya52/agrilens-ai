"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CREDITS_EVENT } from "@/components/account";
import { haptic } from "@/lib/haptics";
import { OUTBOX_EVENT, listOutbox, outboxSupported, queueMessage, type FlushResult } from "@/lib/outbox";
import { readEventStream } from "@/lib/stream";
import type { Attachment, ChatMessage, ChatSummary, Feedback } from "@/types/chat";
import {
  ApiError,
  MESSAGE_PAGE_SIZE,
  createChat,
  listMessages,
  postMessage,
  readPostOutcome,
  sendFeedback,
  type PostMessageBody,
} from "./chat-api";

export type StreamStatus = "idle" | "submitted" | "streaming";

export interface Draft {
  content: string;
  attachments: Attachment[];
}

/**
 * `clientKey` keeps React keys stable when temp ids are swapped for server ids.
 * `pending` marks a message waiting in the offline outbox.
 * `replacing` marks an answer that stays visible while Regenerate waits for the new answer's first text.
 */
export type UiMessage = ChatMessage & { clientKey?: string; pending?: boolean; replacing?: boolean };

interface Thread {
  chatId: string | null;
  messages: UiMessage[];
  stale: boolean;
  hasMore: boolean;
}

interface LoadError {
  chatId: string;
  notFound: boolean;
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
  replace?: UiMessage;
  queueable?: boolean;
}

const TEMP_PREFIX = "temp-";
const EMPTY: UiMessage[] = [];
let tempSeq = 0;

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
const tempId = (kind: string) => `${TEMP_PREFIX}${kind}-${Date.now()}-${tempSeq++}`;

async function loadThread(chatId: string, signal: AbortSignal): Promise<{ messages: UiMessage[]; hasMore: boolean }> {
  const [messages, queued] = await Promise.all([
    listMessages(chatId, {}, signal),
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
  return { messages: [...messages, ...pending], hasMore: messages.length >= MESSAGE_PAGE_SIZE };
}

export function useChatStream({ chatId, onChatCreated, onChatActivity, onRestoreDraft }: Options) {
  const t = useTranslations("chat");
  const [thread, setThread] = useState<Thread>({ chatId: null, messages: [], stale: false, hasMore: false });
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const threadKey = useRef<{ chatId: string | null; stale: boolean }>({ chatId: null, stale: false });
  const abortRef = useRef<AbortController | null>(null);
  const streamChatRef = useRef<string | null>(null);
  // Synchronous guards: `status` from the last render can't stop a double click within one frame.
  const busyRef = useRef(false);
  const olderBusyRef = useRef(false);
  const chatIdRef = useRef(chatId);
  const deferredReloadRef = useRef<string | null>(null);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

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

  function markStale(targetId: string) {
    threadKey.current = { chatId: targetId, stale: true };
    setThread((prev) => (prev.chatId === targetId ? { ...prev, stale: true } : prev));
  }

  useEffect(() => {
    if (streamChatRef.current && streamChatRef.current !== chatId) abortRef.current?.abort();
    if (!chatId) return;
    const key = threadKey.current;
    if (key.chatId === chatId && !key.stale) return;

    const controller = new AbortController();
    loadThread(chatId, controller.signal)
      .then(({ messages, hasMore }) => {
        // Never swap the thread under a reply that is being written; reload once it finishes.
        if (streamChatRef.current === chatId) {
          deferredReloadRef.current = chatId;
          return;
        }
        threadKey.current = { chatId, stale: false };
        setThread({ chatId, messages, stale: false, hasMore });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
        setLoadError({ chatId, notFound });
      });
    return () => controller.abort();
  }, [chatId, loadVersion]);

  useEffect(() => {
    if (!chatId) return;
    const onFlush = (event: Event) => {
      const { sent, dropped, chatIds } = (event as CustomEvent<FlushResult>).detail;
      if (!chatIds.includes(chatId) && dropped === 0) return;
      if (sent === 0 && dropped === 0) return;
      if (threadKey.current.chatId !== chatId) return;
      if (streamChatRef.current === chatId) {
        deferredReloadRef.current = chatId;
        return;
      }
      threadKey.current = { chatId, stale: true };
      setLoadVersion((v) => v + 1);
    };
    window.addEventListener(OUTBOX_EVENT, onFlush);
    return () => window.removeEventListener(OUTBOX_EVENT, onFlush);
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
    const placeholder: UiMessage = { _id: assistantId, chatId: targetId, role: "assistant", content: "", createdAt: new Date().toISOString() };
    const replaced = opts.replace;
    let swapped = false;
    setStreamingId(assistantId);
    if (replaced) patchMessage(targetId, replaced._id, { replacing: true });
    else updateMessages(targetId, (list) => [...list, placeholder]);

    // Regenerate: the old answer is swapped out only when the new one has something to show.
    const startAnswer = () => {
      if (!replaced || swapped) return;
      swapped = true;
      updateMessages(targetId, (list) => [...list.filter((m) => m._id !== replaced._id), placeholder]);
    };

    let text = "";
    let gotMeta = false;
    let finished = false;
    let streaming = false;
    let failure: string | null = null;
    let queued = false;
    let unanswered = false;
    let reload = false;
    let frame = 0;
    const flush = () => {
      frame = 0;
      patchMessage(targetId, assistantId, { content: text });
    };

    try {
      const outcome = await readPostOutcome(await postMessage(targetId, body, controller.signal));
      if (outcome.kind === "credits") {
        failure = "credits";
      } else if (outcome.kind === "conflict") {
        reload = true;
        if (outcome.code === "unanswered") unanswered = true;
        else failure = outcome.code === "busy" ? t("busy") : outcome.error;
      } else if (outcome.kind === "answered") {
        finished = true;
        const ids = new Set(outcome.messages.map((m) => m._id));
        updateMessages(targetId, (list) => [
          ...list.filter((m) => m._id !== opts.optimisticUserId && m._id !== assistantId && !ids.has(m._id)),
          ...outcome.messages,
        ]);
      } else {
        await readEventStream(outcome.response, (event) => {
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
              startAnswer();
              text += event.text;
              if (!streaming) {
                streaming = true;
                setStatus("streaming");
              }
              if (!frame) frame = requestAnimationFrame(flush);
              break;
            case "diagnosis":
              startAnswer();
              patchMessage(targetId, assistantId, { diagnosis: event.diagnosis });
              break;
            case "done":
              startAnswer();
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
          if (replaced) {
            // A failed or stopped Regenerate brings the previous answer back.
            const previous = list.find((m) => m._id === replaced._id) ?? replaced;
            const rest = list.filter((m) => m._id !== assistantId && m._id !== replaced._id);
            return [...rest, { ...previous, replacing: false }];
          }
          let next = text
            ? list.map((m) => (m._id === assistantId ? { ...m, content: text } : m))
            : list.filter((m) => m._id !== assistantId);
          if (!gotMeta && !aborted && failure) next = next.filter((m) => m._id !== opts.optimisticUserId);
          return next;
        });
        if (aborted || text || swapped) markStale(targetId);
        if (!gotMeta && !aborted && !queued && !unanswered && opts.draft) onRestoreDraft(opts.draft);
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
      busyRef.current = false;
      if (reload || deferredReloadRef.current === targetId) {
        deferredReloadRef.current = null;
        markStale(targetId);
        if (chatIdRef.current === targetId) setLoadVersion((v) => v + 1);
      }
      setStreamingId(null);
      setStatus("idle");
    }
  }

  async function send(draft: Draft): Promise<boolean> {
    if (busyRef.current || status !== "idle") return false;
    if (chatId !== null && thread.chatId !== chatId) return false;
    busyRef.current = true;
    setStatus("submitted");
    haptic();

    const idle = () => {
      busyRef.current = false;
      setStatus("idle");
    };

    let targetId = chatId;
    if (!targetId) {
      try {
        const chat = await createChat();
        onChatCreated(chat);
        // The user opened another chat while this one was being created: keep it in the list, don't switch.
        if (chatIdRef.current !== null) {
          idle();
          return false;
        }
        targetId = chat._id;
        replaceThread({ chatId: chat._id, messages: [], stale: false, hasMore: false });
      } catch {
        idle();
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
      idle();
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
    if (!chatId || busyRef.current || status !== "idle" || thread.chatId !== chatId) return;
    const last = thread.messages.at(-1);
    if (!last || last.pending || isTempId(last._id)) return;
    busyRef.current = true;
    setStatus("submitted");
    void run(chatId, { content: "", regenerate: true }, last.role === "assistant" ? { replace: last } : {});
  }

  async function loadOlder(): Promise<boolean> {
    const targetId = thread.chatId;
    if (!targetId || targetId !== chatId || !thread.hasMore || olderBusyRef.current) return false;
    const oldest = thread.messages.find((m) => !isTempId(m._id));
    if (!oldest) return false;
    olderBusyRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await listMessages(targetId, { before: oldest._id });
      const known = new Set(thread.messages.map((m) => m._id));
      const fresh = older.filter((m) => !known.has(m._id));
      setThread((prev) => {
        if (prev.chatId !== targetId) return prev;
        const ids = new Set(prev.messages.map((m) => m._id));
        return {
          ...prev,
          messages: [...fresh.filter((m) => !ids.has(m._id)), ...prev.messages],
          hasMore: fresh.length > 0 && older.length >= MESSAGE_PAGE_SIZE,
        };
      });
      return fresh.length > 0;
    } catch {
      toast.error(t("loadOlderFailed"));
      return false;
    } finally {
      olderBusyRef.current = false;
      setLoadingOlder(false);
    }
  }

  function retryLoad() {
    setLoadError(null);
    setLoadVersion((v) => v + 1);
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
  const failed = chatId !== null && !loaded && loadError?.chatId === chatId;
  const messages = loaded ? thread.messages : EMPTY;
  const last = messages.at(-1);
  return {
    messages,
    isLoading: chatId !== null && !loaded && !failed,
    loadFailed: failed,
    notFound: failed && loadError?.notFound === true,
    retryLoad,
    ready: chatId === null || loaded,
    hasMore: loaded && thread.hasMore,
    loadingOlder,
    loadOlder,
    unanswered: loaded && status === "idle" && last?.role === "user" && !last.pending && !isTempId(last._id),
    status,
    streamingId,
    send,
    stop,
    regenerate,
    setFeedback,
  };
}
