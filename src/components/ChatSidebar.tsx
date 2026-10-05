"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cx } from "@/components/ui";
import Modal from "./Modal";
import { deleteChat, renameChat } from "./chat/chat-api";
import { ChatListSkeleton } from "./chat/ChatSkeleton";
import ChatListItem from "./chat/ChatListItem";
import { startOfToday, toChatRows } from "./chat/group-chats";
import { CloseIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "./chat/icons";
import type { ChatList } from "./chat/useChatList";

interface ChatSidebarProps {
  list: ChatList;
  selectedChatId: string | null;
  onSelectChat: (id: string | null) => void;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}

type Menu = { chatId: string; x: number; y: number };

const MENU_WIDTH = 176;
const menuItem = "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition-colors";

export default function ChatSidebar({ list, selectedChatId, onSelectChat, onNewChat, open, onClose }: ChatSidebarProps) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const [todayStart] = useState(startOfToday);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rows = toChatRows(list.chats, todayStart);

  useEffect(() => {
    if (!menu && !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) setMenu(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, open, onClose]);

  async function rename(id: string, title: string) {
    setEditingId(null);
    list.rename(id, title);
    try {
      await renameChat(id, title);
    } catch {
      toast.error(t("renameFailed"));
      list.refresh();
    }
  }

  async function confirmDelete() {
    const id = deletingId;
    if (!id) return;
    try {
      await deleteChat(id);
      list.remove(id);
      if (id === selectedChatId) onSelectChat(null);
      toast.success(t("chatDeleted"));
    } catch {
      toast.error(t("deleteFailed"));
    }
  }

  const isEmpty = !list.loading && list.chats.length === 0;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label={t("closeChats")}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-14 z-30 bg-soil-950/60 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label={t("conversations")}
        className={cx(
          "fixed bottom-0 left-0 top-14 z-40 flex w-[min(20rem,86vw)] flex-col border-r border-border bg-surface-2 transition-transform duration-300 ease-[var(--ease-field)]",
          "md:static md:z-auto md:w-72 md:translate-x-0 md:bg-surface-2/60",
          open ? "translate-x-0 shadow-raised" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 p-3 pb-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-semibold text-accent-fg shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            <PlusIcon width={17} height={17} strokeWidth={2.2} />
            {t("newChat")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeChats")}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg md:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-3 pb-2">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-fg-subtle transition focus-within:border-accent/60 focus-within:text-fg">
            <SearchIcon width={16} height={16} className="shrink-0" />
            <span className="sr-only">{t("searchChats")}</span>
            <input
              type="search"
              value={list.query}
              onChange={(event) => list.setQuery(event.target.value)}
              placeholder={t("searchChats")}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {list.query && (
              <button type="button" onClick={() => list.setQuery("")} aria-label={t("clearSearch")} className="text-fg-subtle hover:text-fg">
                <CloseIcon width={14} height={14} />
              </button>
            )}
          </label>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4" aria-busy={list.loading}>
          {list.loading && list.chats.length === 0 ? (
            <ChatListSkeleton />
          ) : isEmpty ? (
            <p className="px-5 py-6 text-sm text-fg-subtle">{list.query ? t("noResults") : t("noChats")}</p>
          ) : (
            <ul className={cx("px-2 transition-opacity", list.loading && "opacity-60")}>
              <AnimatePresence initial={false}>
                {rows.map((row) =>
                  row.kind === "header" ? (
                    <motion.li
                      key={`h-${row.key}`}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="px-3 pb-1.5 pt-4 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle first:pt-2"
                    >
                      {t(row.key)}
                    </motion.li>
                  ) : (
                    <motion.li
                      key={row.chat._id}
                      layout="position"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      className="py-px"
                    >
                      <ChatListItem
                        chat={row.chat}
                        active={row.chat._id === selectedChatId}
                        editing={editingId === row.chat._id}
                        onSelect={() => onSelectChat(row.chat._id)}
                        onOpenMenu={(x, y) => setMenu({ chatId: row.chat._id, x, y })}
                        onRename={(title) => void rename(row.chat._id, title)}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    </motion.li>
                  )
                )}
              </AnimatePresence>
            </ul>
          )}
        </nav>
      </aside>

      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-[60]" onPointerDown={() => setMenu(null)} aria-hidden />
            <motion.div
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.14 }}
              className="fixed z-[61] origin-top-left rounded-2xl border border-border-strong bg-surface-2 p-1.5 shadow-raised"
              style={{ width: MENU_WIDTH, left: `min(${menu.x}px, calc(100vw - ${MENU_WIDTH + 8}px))`, top: menu.y }}
            >
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => {
                  setEditingId(menu.chatId);
                  setMenu(null);
                }}
                className={cx(menuItem, "text-fg-muted hover:bg-surface-3 hover:text-fg")}
              >
                <PencilIcon width={16} height={16} />
                {t("rename")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDeletingId(menu.chatId);
                  setMenu(null);
                }}
                className={cx(menuItem, "text-danger hover:bg-danger/10")}
              >
                <TrashIcon width={16} height={16} />
                {t("deleteChat")}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Modal
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={() => void confirmDelete()}
        title={t("deleteChat")}
        message={t("deleteChatConfirm")}
        type="confirm"
        confirmText={t("delete")}
        cancelText={tc("cancel")}
      />
    </>
  );
}
