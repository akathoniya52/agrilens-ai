"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ChatSummary } from "@/types/chat";
import { listChats } from "./chat-api";

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const byRecent = (a: ChatSummary, b: ChatSummary) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);

export function useChatList() {
  const t = useTranslations("chat");
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [result, setResult] = useState<{ search: string | null; chats: ChatSummary[] }>({ search: null, chats: [] });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listChats(search, controller.signal)
      .then((chats) => setResult({ search, chats }))
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult((prev) => ({ ...prev, search }));
        toast.error(t("loadChatsFailed"));
      });
    return () => controller.abort();
  }, [search, version, t]);

  const update = (fn: (chats: ChatSummary[]) => ChatSummary[]) =>
    setResult((prev) => ({ ...prev, chats: fn(prev.chats) }));

  return {
    chats: result.chats,
    loading: result.search !== search,
    query,
    setQuery,
    refresh: () => setVersion((v) => v + 1),
    add: (chat: ChatSummary) => update((chats) => [chat, ...chats.filter((c) => c._id !== chat._id)]),
    touch: ({ _id, title }: { _id: string; title?: string }) =>
      update((chats) =>
        chats
          .map((c) => (c._id === _id ? { ...c, title: title ?? c.title, lastMessageAt: new Date().toISOString() } : c))
          .sort(byRecent)
      ),
    rename: (id: string, title: string) => update((chats) => chats.map((c) => (c._id === id ? { ...c, title } : c))),
    remove: (id: string) => update((chats) => chats.filter((c) => c._id !== id)),
  };
}

export type ChatList = ReturnType<typeof useChatList>;
